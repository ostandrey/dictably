import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminPageClient } from "@/components/app/AdminPageClient";
import { AppShell } from "@/components/app/AppShell";
import { localePath } from "@/i18n/locales";
import { site } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: "en" });
  return {
    title: t("app.adminTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage() {
  const t = await getTranslations({ locale: "en" });
  return (
    <AppShell
      heading={t("app.adminH1")}
      backHref={localePath("en")}
      backLabel={t("app.back")}
      brandName={site.name}
      logoutLabel={t("app.logout")}
      recordingsHref="/app/"
      settingsHref="/app/settings/"
      peopleHref="/app/people/"
      adminHref="/admin/"
      nav="admin"
      navRecordings={t("app.navRecordings")}
      navPeople={t("app.navPeople")}
      navSettings={t("app.navSettings")}
      navAdmin={t("app.navAdmin")}
    >
      <AdminPageClient
        locale="en"
        appHref="/app/"
        loadingLabel={t("app.loading")}
        notFoundTitle={t("app.adminNotFoundTitle")}
        notFoundBody={t("app.adminNotFoundBody")}
        openApp={t("app.adminOpenApp")}
        adminCopy={{
          tabUsers: t("app.adminTabUsers"),
          tabRecordings: t("app.adminTabRecordings"),
          tabJobs: t("app.adminTabJobs"),
          tabCosts: t("app.adminTabCosts"),
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
