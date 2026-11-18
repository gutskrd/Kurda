import type {
  AccountStanding,
  AppealView,
  FileAppealRequest,
  FileReportRequest,
  MyReportsPage,
  ReportReceipt,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * Reports and account standing (shared `reports.ts` lists the routes): one `POST /reports` for everything that can be
 * reported (a person, a message, a group, a post, a comment, a player by seat).
 */
export function fileReport(client: ApiClient, request: FileReportRequest): Promise<ApiResult<ReportReceipt>> {
  return client.post<ReportReceipt>('/reports', request);
}

export function myReports(client: ApiClient): Promise<ApiResult<MyReportsPage>> {
  return client.get<MyReportsPage>('/me/reports');
}

/** Works with a session or with the appeal token a suspended account gets at sign-in. */
export function accountStanding(client: ApiClient): Promise<ApiResult<AccountStanding>> {
  return client.get<AccountStanding>('/me/standing');
}

/** The warning dialog was seen. Without ids, every warning is marked seen. */
export function acknowledgeWarnings(client: ApiClient, ids?: string[]): Promise<ApiResult<{ acknowledged: number }>> {
  return client.post<{ acknowledged: number }>('/me/standing/ack', ids ? { ids } : {});
}

/** Ask for a review of a sanction, or of a report that was found not to break the rules. */
export function fileAppeal(client: ApiClient, request: FileAppealRequest): Promise<ApiResult<AppealView>> {
  return client.post<AppealView>('/me/appeals', request);
}
