import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment, AssignmentType } from '../../common/entities/assignment.entity';
import { AssignmentSubmission, SubmissionStatus } from '../../common/entities/assignment-submission.entity';
import { CourseEnrollment } from '../../common/entities/course-enrollment.entity';
import { UserRole } from '../../common/entities/user.entity';

interface ChoiceQuestion {
  title: string;
  options: string[];
  correctOption: number;
  score: number;
}

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepository: Repository<AssignmentSubmission>,
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,
  ) {}

  async findByCourse(courseId: string) {
    return this.assignmentRepository.find({
      where: { courseId },
      relations: ['teacher'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: ['teacher', 'lesson'],
    });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }
    return assignment;
  }

  async create(userId: string, data: Partial<Assignment>) {
    const payload: Partial<Assignment> = {
      ...data,
      teacherId: userId,
    };

    if (data.type === AssignmentType.CHOICE) {
      const questions = this.validateChoiceQuestions(data.questions);
      payload.questions = questions;
      // 满分按各题分值合计
      payload.maxScore = questions.reduce((sum, q) => sum + q.score, 0);
    }

    const assignment = this.assignmentRepository.create(payload);
    return this.assignmentRepository.save(assignment);
  }

  async submit(studentId: string, role: UserRole, assignmentId: string, data: Partial<AssignmentSubmission>) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }

    if (role !== UserRole.STUDENT) {
      throw new ForbiddenException('只有学生可以提交作业');
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { studentId, courseId: assignment.courseId },
    });
    if (!enrollment) {
      throw new ForbiddenException('未报名该课程，无法提交作业');
    }

    if (assignment.deadline && new Date(assignment.deadline).getTime() < Date.now()) {
      throw new ForbiddenException('作业已截止，无法提交');
    }

    // 先完成全部校验再落库；校验不通过时整份拒绝，原提交保留
    let fields: Partial<AssignmentSubmission>;
    if (assignment.type === AssignmentType.CHOICE) {
      fields = this.buildChoiceSubmission(assignment, data);
    } else {
      fields = this.buildPlainSubmission(assignment, data);
    }

    // 重复提交只覆盖本人原记录，不新增第二份（assignmentId + studentId 唯一）
    const existing = await this.submissionRepository.findOne({
      where: { studentId, assignmentId },
    });

    if (existing) {
      Object.assign(existing, fields);
      return this.submissionRepository.save(existing);
    }

    const submission = this.submissionRepository.create({
      ...fields,
      studentId,
      assignmentId,
    });
    return this.submissionRepository.save(submission);
  }

  async grade(teacherId: string, submissionId: string, score: number, feedback: string) {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['assignment'],
    });

    if (!submission) {
      throw new NotFoundException('提交不存在');
    }
    if (submission.assignment.teacherId !== teacherId) {
      throw new ForbiddenException('无权批改此作业');
    }

    submission.score = score;
    submission.feedback = feedback;
    submission.status = SubmissionStatus.GRADED;
    submission.gradedAt = new Date();

    return this.submissionRepository.save(submission);
  }

  async findSubmissionsByAssignment(assignmentId: string) {
    return this.submissionRepository.find({
      where: { assignmentId },
      relations: ['student'],
      order: { createdAt: 'DESC' },
    });
  }

  async findMySubmission(studentId: string, assignmentId: string) {
    return this.submissionRepository.findOne({
      where: { studentId, assignmentId },
    });
  }

  private validateChoiceQuestions(raw: any): ChoiceQuestion[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('选择题作业至少需要一道题目');
    }

    return raw.map((q, index) => {
      const label = `第 ${index + 1} 题`;
      if (!q || typeof q.title !== 'string' || !q.title.trim()) {
        throw new BadRequestException(`${label}缺少题干`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new BadRequestException(`${label}至少需要两个选项`);
      }
      if (q.options.some((o: unknown) => typeof o !== 'string' || !o.trim())) {
        throw new BadRequestException(`${label}存在空选项`);
      }
      if (!Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption >= q.options.length) {
        throw new BadRequestException(`${label}的正确选项越界`);
      }
      if (!Number.isInteger(q.score) || q.score <= 0) {
        throw new BadRequestException(`${label}的分值必须为正整数`);
      }
      return {
        title: q.title,
        options: q.options,
        correctOption: q.correctOption,
        score: q.score,
      };
    });
  }

  private buildChoiceSubmission(
    assignment: Assignment,
    data: Partial<AssignmentSubmission>,
  ): Partial<AssignmentSubmission> {
    const questions: ChoiceQuestion[] = Array.isArray(assignment.questions) ? assignment.questions : [];

    // 题型不符：选择题作业只能通过 choiceAnswers 作答
    if (data.textAnswer !== undefined || data.attachmentUrls !== undefined) {
      throw new BadRequestException('题型不符：选择题作业需按题号选择选项');
    }
    if (!Array.isArray(data.choiceAnswers)) {
      throw new BadRequestException('缺少选择题答案');
    }

    const answers = data.choiceAnswers;
    if (answers.length !== questions.length) {
      throw new BadRequestException(
        `答案题数不符：应提交 ${questions.length} 题，实际 ${answers.length} 题`,
      );
    }

    // 缺失、越界或类型不符均整份拒绝
    answers.forEach((answer, index) => {
      if (answer === null || answer === undefined || answer === '') {
        throw new BadRequestException(`第 ${index + 1} 题未作答`);
      }
      if (typeof answer !== 'number' || !Number.isInteger(answer)) {
        throw new BadRequestException(`第 ${index + 1} 题答案必须是选项序号`);
      }
      if (answer < 0 || answer >= questions[index].options.length) {
        throw new BadRequestException(`第 ${index + 1} 题选项越界`);
      }
    });

    // 一次提交即算出答对题数、得分与逐题正误
    const results = questions.map((q, index) => {
      const selected = answers[index];
      const correct = selected === q.correctOption;
      return {
        questionIndex: index,
        selected,
        correct,
        score: correct ? q.score : 0,
      };
    });

    const correctCount = results.filter(r => r.correct).length;
    const score = results.reduce((sum, r) => sum + r.score, 0);
    const now = new Date();

    return {
      choiceAnswers: answers,
      textAnswer: null,
      attachmentUrls: null,
      choiceResults: results,
      correctCount,
      score,
      status: SubmissionStatus.GRADED,
      gradedAt: now,
      feedback: null,
    };
  }

  private buildPlainSubmission(
    assignment: Assignment,
    data: Partial<AssignmentSubmission>,
  ): Partial<AssignmentSubmission> {
    // 文本题与附件批改流程保持原样：只更新答案内容，不触碰批改状态/分数，
    // 不自动判分，等待教师批改（新记录状态由实体默认值给出 submitted）
    if (data.choiceAnswers !== undefined) {
      throw new BadRequestException('题型不符：该作业不支持选择题答案');
    }

    const fields: Partial<AssignmentSubmission> = {};

    if (assignment.type === AssignmentType.TEXT) {
      fields.textAnswer = data.textAnswer ?? null;
    } else if (assignment.type === AssignmentType.ATTACHMENT) {
      fields.attachmentUrls = data.attachmentUrls ?? null;
      if (data.textAnswer !== undefined) {
        fields.textAnswer = data.textAnswer;
      }
    }

    return fields;
  }
}
