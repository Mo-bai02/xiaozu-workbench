export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'mid' | 'high';

export interface Member {
  id: string;
  name: string;
  role: string;
  email: string;
  status: 'active' | 'away';
  joinedAt: number;
}

export interface Task {
  id: string;
  title: string;
  desc: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  tags: string[];
  createdAt: number;
  dueAt: number | null;
  completedAt: number | null;
}

export interface Activity {
  id: string;
  time: number;
  actor: string;
  action: string;
  target: string;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: '低',
  mid: '中',
  high: '高',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'default',
  mid: 'blue',
  high: 'red',
};

export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done'];
