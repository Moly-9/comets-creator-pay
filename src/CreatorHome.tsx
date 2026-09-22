import { Bell, ChevronRight, Info, ReceiptText } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, type LinkProps } from "react-router-dom";
import { useDataScope } from "./hooks/useDataScope";
import { creatorHomepageSocialSummary } from "./creator-display";
import { buildHomeTodos, buildRecentUpdates, firstThreeRowHeight, groupHomeAmountInvoices, type HomeTodo, type HomeUpdate } from "./creator-home";
import { sumInvoiceAmounts } from "./payment-relations";
import type { Contract, CreatorTask, Invoice, PaymentAttempt, UserProfile } from "./types";

// Translate only at the presentation boundary; task and payment records retain their stored values.
const homeCopyKeys: Record<string, string> = {
  "付款失败": "home.paymentFailed", "待签署 Invoice": "home.pendingInvoiceSignature",
  "待签署合同": "home.pendingContractSignature", "待处理 Invoice": "home.pendingInvoice",
  "待修改 Invoice": "home.invoiceChangesRequired", "待重传 Invoice": "home.invoiceReupload",
  "已到账": "home.received", "付款中": "home.paymentProcessing", "审核中": "home.underReview",
  "待付款": "home.awaitingPayment", "待确认": "home.awaitingConfirmation",
  "待签署": "home.awaitingSignature", "请更新收款信息": "home.updatePayoutInformation",
  "待您签署": "home.awaitingYourSignature", "待核对关联": "home.checkAssociation",
  "去处理": "home.goHandle", "去签署": "home.goSign", "查看详情": "home.viewDetails",
  "查看": "common.view", "处理中": "common.processing",
  "请上传 PDF、PNG 或 JPEG 文件并确认识别结果。": "home.uploadDocumentDescription",
  "请核对模拟 AI 结果及收款账户后提交审核。": "home.confirmRecognitionDescription",
  "请修改识别信息并重新确认。": "home.correctRecognitionDescription",
  "当前文件无法继续处理，请上传新版本。": "home.reuploadDescription",
  "反馈已收到，等待工作人员核查。": "home.feedbackDescription",
  "请按退回原因完成修改。": "home.returnedDescription",
  "请核对 Invoice 和脱敏收款账户后完成演示签署。": "home.invoiceSignDescription",
  "请核对合同金额、服务周期、履约义务和脱敏收款账户。": "home.contractSignDescription",
};

function useHomeCopy() {
  const { t } = useTranslation();
  return (value: string) => {
    const today = value.match(/^今天\s+(.+)$/);
    if (today) return t("home.todayAt", { time: today[1] });
    const yesterday = value.match(/^昨天\s+(.+)$/);
    if (yesterday) return t("home.yesterdayAt", { time: yesterday[1] });
    return value === "刚刚" ? t("home.justNow") : homeCopyKeys[value] ? t(homeCopyKeys[value]) : value;
  };
}

type HomeProps = {
  profile: UserProfile;
  contracts: Contract[];
  invoices: Invoice[];
  tasks: CreatorTask[];
  attempts: PaymentAttempt[];
  readOnly?: boolean;
};

function Link({ to, ...props }: LinkProps) {
  const { isAdminView, scopeQuery } = useDataScope();
  if (!isAdminView || !scopeQuery || typeof to !== "string" || !to.startsWith("/")) return <RouterLink to={to} {...props} />;
  const [path, query = ""] = to.split("?");
  const params = new URLSearchParams(query);
  params.set("userId", scopeQuery.slice(8));
  return <RouterLink to={`${path}?${params}`} {...props} />;
}

function HomeAmountTip({ id, title, children }: { id: string; title: string; children: string }) {
  const { t } = useTranslation();
  return <span className="amount-info-tooltip"><button type="button" aria-label={t("home.viewAmountHelp", { title })} aria-describedby={id}><Info size={12} /></button><span id={id} role="tooltip">{children}</span></span>;
}

function HomeAmounts({ invoices, attempts }: Pick<HomeProps, "invoices" | "attempts">) {
  const { t } = useTranslation();
  const { PENDING: pending, PROCESSING: processing, PAID: paid } = groupHomeAmountInvoices(invoices, attempts);
  return <section className="request-money-overview" aria-label={t("home.amountOverview")}>
    <article><div><span><i className="coral" />{t("home.pendingAmount")}<HomeAmountTip id="requesting-amount-tip" title={t("home.pendingAmount")}>{t("home.pendingAmountHelp")}</HomeAmountTip></span><strong>{sumInvoiceAmounts(pending).replace("—", "-")}</strong><small>{t("home.invoiceCount", { count: pending.length })}</small></div></article>
    <article><div><span><i className="blue" />{t("home.processingAmount")}<HomeAmountTip id="pending-arrival-amount-tip" title={t("home.processingAmount")}>{t("home.processingAmountHelp")}</HomeAmountTip></span><strong>{sumInvoiceAmounts(processing).replace("—", "-")}</strong><small>{t("home.invoiceCount", { count: processing.length })}</small></div></article>
    <article><div><span><i className="green" />{t("home.paidAmount")}<HomeAmountTip id="completed-amount-tip" title={t("home.paidAmount")}>{t("home.paidAmountHelp")}</HomeAmountTip></span><strong>{sumInvoiceAmounts(paid).replace("—", "-")}</strong><small>{t("home.invoiceCount", { count: paid.length })}</small></div></article>
  </section>;
}

function HomePanel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const { t } = useTranslation();
  return <section className="content-card home-list-panel" aria-label={title}><header><div><h2>{title}</h2>{count !== undefined ? <span>{t("common.items", { count })}</span> : null}</div></header>{children}</section>;
}

function HomeEmpty({ kind }: { kind: "待办" | "更新" }) {
  const { t } = useTranslation();
  return <div className="home-list-empty"><ReceiptText size={24} /><strong>{t(kind === "待办" ? "home.noTodo" : "home.noUpdates")}</strong></div>;
}

function HomeTodos({ items, listRef }: { items: HomeTodo[]; listRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const display = useHomeCopy();
  return <HomePanel title={t("home.todo")} count={items.length}>{items.length ? <>
    <div ref={listRef} className={`home-mobile-list ${items.length > 3 ? "home-todo-scroll" : ""}`} role={items.length > 3 ? "region" : undefined} aria-label={items.length > 3 ? t("home.todoListLabel", { count: items.length }) : undefined} tabIndex={items.length > 3 ? 0 : undefined}>{items.map((item) => <article className="home-mobile-row" key={item.id}><header><span className={`home-state state-${item.tone}`}>{display(item.label)}</span><strong className="home-amount">{item.amount}</strong></header><strong className="home-document-number">{item.number}</strong><dl><div><dt>{t("home.linkedContract")}</dt><dd>{display(item.contractNumber)}</dd></div><div><dt>{t("home.statusDescription")}</dt><dd>{display(item.description)}</dd></div></dl><Link className="home-action" to={item.to}>{display(item.action)}<ChevronRight size={15} /></Link></article>)}</div>
  </> : <HomeEmpty kind="待办" />}</HomePanel>;
}

function HomeUpdates({ items, listRef }: { items: HomeUpdate[]; listRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const display = useHomeCopy();
  return <HomePanel title={t("home.recentUpdates")}>{items.length ? <>
    <div ref={listRef} className="home-mobile-list">{items.map((item) => <Link className="home-mobile-row" to={item.to} key={item.id}><header><strong className="home-document-number">{item.number}</strong><span className={`home-state state-${item.tone}`}>{display(item.status)}</span></header><strong className="home-amount">{item.amount}</strong><dl><div><dt>{t("home.linkedContract")}</dt><dd>{display(item.contractNumber)}</dd></div><div><dt>{t("home.updatedAt")}</dt><dd>{display(item.updatedAt)}</dd></div></dl><span className="home-action">{display(item.action)}<ChevronRight size={15} /></span></Link>)}</div>
  </> : <HomeEmpty kind="更新" />}</HomePanel>;
}

export default function CreatorHome({ profile, contracts, invoices, tasks, attempts, readOnly }: HomeProps) {
  const { t } = useTranslation();
  const socialSummary = creatorHomepageSocialSummary(profile.social);
  const socialMatch = socialSummary.match(/^(.*) 等 (\d+) 个主页$/);
  const todos = buildHomeTodos(contracts, invoices, tasks, attempts);
  const updates = buildRecentUpdates(contracts, invoices, attempts);
  const listKeys = `${todos.map((item) => item.id).join("|")}::${updates.map((item) => item.id).join("|")}`;
  const todoListRef = useRef<HTMLDivElement>(null);
  const updateListRef = useRef<HTMLDivElement>(null);
  const [listWindow, setListWindow] = useState({ height: 144, spacer: 0 });

  useLayoutEffect(() => {
    const lists = [todoListRef.current, updateListRef.current];
    const measure = (list: HTMLDivElement | null) => {
      if (!list) return 144;
      const style = getComputedStyle(list);
      const heights = [...list.querySelectorAll<HTMLElement>(".home-mobile-row")].map((row) => row.getBoundingClientRect().height);
      return firstThreeRowHeight(heights, parseFloat(style.rowGap) || 0, (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0));
    };
    const recalculate = () => {
      const todoHeight = measure(lists[0]);
      const height = Math.max(144, todoHeight, measure(lists[1]));
      setListWindow((current) => current.height === height && current.spacer === Math.max(0, height - todoHeight)
        ? current : { height, spacer: Math.max(0, height - todoHeight) });
    };
    const observer = new ResizeObserver(recalculate);
    lists.forEach((list) => {
      if (!list) return;
      observer.observe(list);
      list.querySelectorAll<HTMLElement>(".home-mobile-row").forEach((row) => observer.observe(row));
    });
    recalculate();
    return () => observer.disconnect();
  }, [listKeys]);

  const listStyle = {
    "--home-list-window-height": `${listWindow.height}px`,
    "--home-todo-spacer": `${todos.length > 3 ? listWindow.spacer : 0}px`,
  } as CSSProperties;
  return <div className="page-stack request-home-page creator-home-v2">
    <header className="request-home-greeting"><h1>{t("home.greeting", { name: profile.displayName })} <span aria-hidden="true">👋</span></h1><p>{t("home.welcome", { profiles: socialMatch ? t("home.socialProfiles", { name: socialMatch[1], count: Number(socialMatch[2]) }) : socialSummary })}</p></header>
    <HomeAmounts invoices={invoices} attempts={attempts} />
    <div className="home-list-columns" style={listStyle}>
      <HomeTodos items={readOnly ? todos.map((item) => ({ ...item, action: "查看" })) : todos} listRef={todoListRef} />
      <HomeUpdates items={updates} listRef={updateListRef} />
    </div>
    {!readOnly && <Link className="home-notification-shortcut" to="/notifications"><Bell size={15} />{t("home.viewNotifications")}<ChevronRight size={15} /></Link>}
  </div>;
}
