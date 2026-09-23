export enum AssignmentType {
  TEXT = 'text',
  CHOICE = 'choice',
  ATTACHMENT = 'attachment',
}

export enum SubmissionStatus {
  SUBMITTED = 'submitted',
  GRADED = 'graded',
}

export interface ChoiceQuestion {
  question: string;
  options: string[];
  answer: number;
  score: number;
}

export interface ChoiceAnswerItem {
  questionIndex: number;
  selected: number;
  correct: boolean;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  courseId: string;
  lessonId?: string;
  teacherId: string;
  type: AssignmentType;
  questions?: ChoiceQuestion[];
  deadline?: Date;
  maxScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  textAnswer?: string;
  choiceAnswers?: ChoiceAnswerItem[];
  attachmentUrls?: string[];
  status: SubmissionStatus;
  score?: number;
  correctCount?: number;
  feedback?: string;
  gradedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
