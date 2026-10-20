/** The admin's component kit — one import for a page. */
export { Badge, Banner, Button, Note, PageHeader, Section, Stat, VisuallyHidden, type Tone } from './basics';
export { ConfirmDialog, Dialog, DialogProvider, useDialogs, type ConfirmOptions, type PromptOptions } from './Dialog';
export { Drawer } from './Drawer';
export { describeError, errorLine, type DescribedError, type ErrorKind } from './errors';
export { Checkbox, Field, FieldRow, FormActions, Select, TextInput, Textarea } from './Field';
export { useCountdown, useDebounced, useLoad, useMediaQuery, type Loaded } from './hooks';
export { Icon, type IconName } from './icons';
export { ActionMenu, type MenuItem } from './Menu';
export { EmptyState, ErrorState, Loading } from './states';
export { Pagination, Table, type Column, type Paging, type SortState, type TableLayout } from './Table';
export { TabPanel, Tabs, type TabItem } from './Tabs';
export { Time, absoluteTime, clockTime, duration, fromLocalInput, relativeTime, shortDate, toLocalInput, waitText } from './Time';
export { ToastProvider, useToast, TOAST_MS, type ToastTone } from './Toast';
export { UserLink, userHref, type UserRef } from './UserLink';
