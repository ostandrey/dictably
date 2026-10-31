import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminPageClient } from "@/components/app/AdminPageClient";
import { AppShell } from "@/components/app/AppShell";
import { localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "uk" });
  return {
    title: t("app.adminTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function UkAdminPage() {
  const t = await getTranslations({ locale: "uk" });
  return (
    <AppShell
      heading={t("app.adminH1")}
      backHref={localePath("uk")}
      backLabel={t("app.back")}
      brandName={site.name}
      logoutLabel={t("app.logout")}
      recordingsHref="/uk/app/"
      settingsHref="/uk/app/settings/"
      peopleHref="/uk/app/people/"
      adminHref="/uk/admin/"
      nav="admin"
      navRecordings={t("app.navRecordings")}
      navPeople={t("app.navPeople")}
      navSettings={t("app.navSettings")}
      navAdmin={t("app.navAdmin")}
    >
      <AdminPageClient
        locale="uk"
        appHref="/uk/app/"
        loadingLabel={t("app.loading")}
        notFoundTitle={t("app.adminNotFoundTitle")}
        notFoundBody={t("app.adminNotFoundBody")}
        openApp={t("app.adminOpenApp")}
        adminCopy={{
          tabUsers: t("app.adminTabUsers"),
          tabRecordings: t("app.adminTabRecordings"),
          tabJobs: t("app.adminTabJobs"),
          tabCosts: t("app.adminTabCosts"),
          tabFunnel: t("app.adminTabFunnel"),
          tabOps: t("app.adminTabOps"),
          opsQueue: t("app.adminOpsQueue"),
          opsRunning: t("app.adminOpsRunning"),
          opsMediaQueued: t("app.adminOpsMediaQueued"),
          opsSucceeded: t("app.adminOpsSucceeded"),
          opsFailed: t("app.adminOpsFailed"),
          opsErrorRate: t("app.adminOpsErrorRate"),
          opsAvgProcess: t("app.adminOpsAvgProcess"),
          opsDisk: t("app.adminOpsDisk"),
          opsStorage: t("app.adminOpsStorage"),
          funnelUsers: t("app.adminFunnelUsers"),
          funnelStep: t("app.adminFunnelStep"),
          funnelPctSignups: t("app.adminFunnelPctSignups"),
          funnelPctPrev: t("app.adminFunnelPctPrev"),
          funnelCohort: t("app.adminFunnelCohort"),
          funnelActive: t("app.adminFunnelActive"),
          funnelSources: t("app.adminFunnelSources"),
          funnelSource: t("app.adminFunnelSource"),
          funnelDays7: t("app.adminFunnelDays7"),
          funnelDays30: t("app.adminFunnelDays30"),
          funnelStepSignedUp: t("app.adminFunnelStepSignedUp"),
          funnelStepUploaded: t("app.adminFunnelStepUploaded"),
          funnelStepReady: t("app.adminFunnelStepReady"),
          funnelStepFailed: t("app.adminFunnelStepFailed"),
          funnelStepMinutes: t("app.adminFunnelStepMinutes"),
          funnelStepExport: t("app.adminFunnelStepExport"),
          funnelStepRegen: t("app.adminFunnelStepRegen"),
          email: t("app.adminColEmail"),
          role: t("app.adminColRole"),
          balance: t("app.adminColBalance"),
          grant: t("app.adminGrant"),
          grantHours: t("app.adminGrantHours"),
          filename: t("app.adminColFilename"),
          owner: t("app.adminColOwner"),
          status: t("app.adminColStatus"),
          error: t("app.adminColError"),
          delete: t("app.adminDelete"),
          kind: t("app.adminColKind"),
          attempts: t("app.adminColAttempts"),
          retry: t("app.adminRetry"),
          filterFailed: t("app.adminFilterFailed"),
          filterAll: t("app.adminFilterAll"),
          periodDay: t("app.adminPeriodDay"),
          periodMonth: t("app.adminPeriodMonth"),
          llm: t("app.adminCostLlm"),
          gpu: t("app.adminCostGpu"),
          api: t("app.adminCostApi"),
          total: t("app.adminCostTotal"),
          empty: t("app.adminEmpty"),
          loading: t("app.loading"),
          actionError: t("app.error"),
        }}
      />
    </AppShell>
  );
}
