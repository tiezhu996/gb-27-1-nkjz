import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment, AssignmentType } from '../../common/entities/assignment.entity';
import { AssignmentSubmission, SubmissionStatus } from '../../common/entities/assignment-submission.entity';
import { CourseEnrollment } from '../../common/entities/course-enrollment.entity';
import { UserRole } from '../../common/entities/user.entity';

interface ChoiceQuestion {
  question: string;
  options: string[];
  answer: number;
  score: number;
}

interface ChoiceAnswerItem {
  questionIndex: number;
  selected: number;
  correct: boolean;
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

  async create(userId: string, role: UserRole, data: Partial<Assignment>) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException('只有教师可以发布作业');
    }

    const type = (data.type as AssignmentType) || AssignmentType.TEXT;

    const assignment = this.assignmentRepository.create({
      title: data.title,
      description: data.description || '',
      courseId: data.courseId,
      lessonId: data.lessonId,
      deadline: data.deadline ? new Date(data.deadline) : null,
      teacherId: userId,
      type,
    });

    if (type === AssignmentType.CHOICE) {
      const questions = this.normalizeQuestions(data.questions);
      assignment.questions = questions;
      // 满分按各题分值合计
      assignment.maxScore = questions.reduce((sum, q) => sum + q.score, 0);
    } else {
      assignment.questions = null;
      assignment.maxScore = typeof data.maxScore === 'number' && data.maxScore > 0 ? data.maxScore : 100;
    }

    return this.assignmentRepository.save(assignment);
  }

  private normalizeQuestions(raw: any): ChoiceQuestion[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('选择题至少包含一道题目');
    }

    return raw.map((q, index) => {
      const questionText = typeof q?.question === 'string' ? q.question.trim() : '';
      if (!questionText) {
        throw new BadRequestException(`第 ${index + 1} 题缺少题干`);
      }

      const options: string[] = Array.isArray(q?.options)
        ? q.options.map((o: any) => (typeof o === 'string' ? o.trim() : '')).filter((o: string) => o.length > 0)
        : [];
      if (options.length < 2) {
        throw new BadRequestException(`第 ${index + 1} 题至少需要两个选项`);
      }

      const answer = Number(q?.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        throw new BadRequestException(`第 ${index + 1} 题的正确选项越界`);
      }

      const score = Number(q?.score);
      if (!Number.isFinite(score) || score <= 0) {
        throw new BadRequestException(`第 ${index + 1} 题的分值必须大于 0`);
      }

      return { question: questionText, options, answer, score };
    });
  }

  async submit(studentId: string, role: UserRole, assignmentId: string, data: Partial<AssignmentSubmission>) {
    if (role !== UserRole.STUDENT) {
      throw new ForbiddenException('只有学生可以提交作业');
    }

    const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }

    // 只能提交本人已报名课程的作业
    const enrollment = await this.enrollmentRepository.findOne({
      where: { studentId, courseId: assignment.courseId },
    });
    if (!enrollment) {
      throw new ForbiddenException('未报名该课程，不能提交作业');
    }

    // 截止后不能提交
    if (assignment.deadline && new Date(assignment.deadline).getTime() < Date.now()) {
      throw new BadRequestException('作业已截止，不能提交');
    }

    // 以下任何校验失败都会抛出异常，不会写库，原提交保留
    if (assignment.type === AssignmentType.CHOICE) {
      return this.submitChoice(studentId, assignment, data);
    }
    return this.submitNonChoice(studentId, assignment, data);
  }

  private async submitChoice(
    studentId: string,
    assignment: Assignment,
    data: Partial<AssignmentSubmission>,
  ) {
    const questions: ChoiceQuestion[] = Array.isArray(assignment.questions) ? assignment.questions : [];
    if (questions.length === 0) {
      throw new BadRequestException('该作业没有选择题，题型不符');
    }

    // 题型不符：选择题作业只接受 choiceAnswers
    if (data.textAnswer !== undefined && data.textAnswer !== null && `${data.textAnswer}`.trim() !== '') {
      throw new BadRequestException('题型不符：选择题作业请提交选项答案');
    }

    const rawAnswers = data.choiceAnswers;
    if (!Array.isArray(rawAnswers)) {
      throw new BadRequestException('请按题号提交全部题目的选项');
    }

    // 缺题/多题一律整份拒绝
    if (rawAnswers.length !== questions.length) {
      throw new BadRequestException(`答案题数应为 ${questions.length} 题，缺失或多余的题目会导致整份提交被拒绝`);
    }

    const answerItems: ChoiceAnswerItem[] = [];
    for (let i = 0; i < questions.length; i++) {
      const selected = Number(rawAnswers[i]);
      // 缺失（null/undefined/NaN）或越界都拒绝
      if (!Number.isInteger(selected) || selected < 0 || selected >= questions[i].options.length) {
        throw new BadRequestException(`第 ${i + 1} 题的选项缺失或越界`);
      }
      answerItems.push({
        questionIndex: i,
        selected,
        correct: selected === questions[i].answer,
      });
    }

    // 有效提交一次算出答对题数与得分
    const correctCount = answerItems.filter((a) => a.correct).length;
    const score = answerItems.reduce((sum, a) => sum + (a.correct ? questions[a.questionIndex].score : 0), 0);
    const now = new Date();

    // 重复提交只覆盖本人原记录，不新增第二份
    const existing = await this.submissionRepository.findOne({
      where: { studentId, assignmentId: assignment.id },
    });

    if (existing) {
      existing.choiceAnswers = answerItems;
      existing.textAnswer = null;
      existing.attachmentUrls = null;
      existing.status = SubmissionStatus.GRADED;
      existing.score = score;
      existing.correctCount = correctCount;
      existing.feedback = null;
      existing.gradedAt = now;
      return this.submissionRepository.save(existing);
    }

    const submission = this.submissionRepository.create({
      studentId,
      assignmentId: assignment.id,
      choiceAnswers: answerItems,
      status: SubmissionStatus.GRADED,
      score,
      correctCount,
      gradedAt: now,
    });
    return this.submissionRepository.save(submission);
  }

  private async submitNonChoice(
    studentId: string,
    assignment: Assignment,
    data: Partial<AssignmentSubmission>,
  ) {
    // 题型不符：文本题/附件作业不接受 choiceAnswers
    if (data.choiceAnswers !== undefined && data.choiceAnswers !== null) {
      throw new BadRequestException('题型不符：该作业不接受选择题答案');
    }

    const existing = await this.submissionRepository.findOne({
      where: { studentId, assignmentId: assignment.id },
    });

    const now = new Date();

    if (existing) {
      if (data.textAnswer !== undefined) {
        existing.textAnswer = data.textAnswer;
      }
      if (data.attachmentUrls !== undefined) {
        existing.attachmentUrls = data.attachmentUrls;
      }
      // 文本题与附件仍走教师手动批改流程：覆盖后回到待批改
      existing.status = SubmissionStatus.SUBMITTED;
      existing.score = null;
      existing.correctCount = null;
      existing.feedback = null;
      existing.gradedAt = null;
      existing.updatedAt = now;
      return this.submissionRepository.save(existing);
    }

    const submission = this.submissionRepository.create({
      studentId,
      assignmentId: assignment.id,
      textAnswer: data.textAnswer ?? null,
      attachmentUrls: data.attachmentUrls ?? null,
      status: SubmissionStatus.SUBMITTED,
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
    if (submission.assignment.type === AssignmentType.CHOICE) {
      throw new BadRequestException('选择题由系统自动批改，无需教师打分');
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
}
