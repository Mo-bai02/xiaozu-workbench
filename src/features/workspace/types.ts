import type { Priority, TaskStatus } from './store';

export type { Activity, Member, Priority, Task, TaskStatus } from './store';

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
