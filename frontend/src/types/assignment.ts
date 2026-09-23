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
  title: string;
  options: string[];
  correctOption: number;
  score: number;
}

export interface ChoiceResult {
  questionIndex: number;
  selected: number;
  correct: boolean;
  score: number;
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
  deadline?: string | Date;
  maxScore: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  student?: { id: string; name: string; avatar?: string };
  textAnswer?: string;
  choiceAnswers?: number[];
  attachmentUrls?: string[];
  status: SubmissionStatus;
  score?: number;
  correctCount?: number;
  choiceResults?: ChoiceResult[];
  feedback?: string;
  gradedAt?: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}
