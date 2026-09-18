# COMETS Creator Pay Design QA

## Iteration 83: Creator Home, Collection Naming, and Contract Lifecycle

- Source visual truth: the pre-change creator `/` and `/contracts` pages captured in the Codex in-app browser at a `963 x 907` browser viewport, together with the approved implementation plan. The browser capture API did not expose a filesystem export path for these baseline images.
- Browser-rendered implementation evidence: final in-app browser captures of creator `/` and `/contracts` at the same `963 x 907` viewport; additional responsive captures at `1366 x 768`, `768 x 1024`, and `375 x 812`; and administrator `/admin/contracts` captures at `1366 x 768` and `375 x 812`. The capture API did not expose local screenshot paths.
- Density normalization: every baseline and implementation capture used the same browser-native 1x density. Comparisons were made at matching route, account role, interaction state, and viewport before reviewing the additional breakpoints.
- State: authenticated Léa Martin creator workspace for the homepage, contract list, and pending-signature contract detail; authenticated administrator workspace for the all-creator contract list. The remote Mac environment was not updated.
- Full-view comparison evidence: the established COMETS shell, navigation anatomy, greeting, action cards, amount strip, dense collection list, contract toolbar, list density, borders, radii, shadows, and typography remain unchanged. The creator navigation now reads `首页`, the homepage module reads `收款`, and its identifier/status/progress/search copy uses `收款`. Contract overview anatomy expands from three to four balanced metrics and uses the existing restrained pastel operational palette.
- Focused-region comparison: a separate crop was not required because every changed visual surface—sidebar label, homepage module heading and table labels, four contract summary metrics, filter tabs, status badges, and three-step detail track—was fully legible in the matched full-view captures.
- Data and interaction evidence: creator contract metrics render `8 / 2 / 3 / 3`; administrator metrics render `18 / 5 / 7 / 6`; the creator `待签署` filter returns exactly two contracts; the detail track renders `待签署 → 执行中 → 已过期`; and linked collection rows retain the contract lifecycle while Invoice status drives collection progress.
- Responsive evidence: the creator homepage, creator contract list, creator contract detail, and administrator contract list all reported `documentElement.scrollWidth === documentElement.clientWidth` at the tested desktop, iPad, and phone viewports. Desktop keeps the four-metric row; narrower widths collapse to two and then one column without clipping.
- Browser console: a fresh final browser tab reported zero warning and error entries.
- Automated verification: TypeScript passed; Vitest `108 / 108` passed; Vite production build and Sites packaging passed; Sites worker tests `4 / 4` passed; `git diff --check` passed.
- Environment: local test environment only. `192.168.88.188:8772` was not updated.

- Required fidelity surfaces:
  - Fonts and typography: existing family, optical weights, sizes, line heights, truncation, and hierarchy are unchanged; the new Chinese labels fit every desktop and mobile control without wrapping or collision.
  - Spacing and layout rhythm: creator and administrator shells retain their established content widths and vertical rhythm; the fourth contract metric follows the current grid anatomy and collapses cleanly at responsive breakpoints.
  - Colors and visual tokens: the new lifecycle uses existing lilac, blue, and neutral semantic treatments; no unrelated palette change was introduced.
  - Image quality and asset fidelity: existing COMETS brand assets and Lucide interface icons remain unchanged and sharp; no placeholder or custom-drawn asset was introduced.
  - Copy and content: creator-facing request language consistently uses `收款`, administrator `请款项目` language remains unchanged, and contractual `请款内容` copy remains intact.

- Comparison history: the matched baseline/final review found no actionable P0/P1/P2 visual mismatch. Responsive checks confirmed that the additional contract metric and new labels do not cause overflow or hidden controls.
- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 84: External Invoice Collection and Payment Timeline MVP

- Source of truth: the external Invoice task, OCR correction, review, payout comparison, and payment-recovery requirements supplied on 2026-09-19.
- Desktop verification: Invoice list and external Invoice detail were checked at the default local browser viewport. The list renders seven Invoice-centric columns without project or brand fields; the detail retains the established 60/40 document/inspection workspace.
- Mobile verification: the payment-failure external Invoice detail was checked at `390 × 844`. Summary cards, failure notice, document reader, horizontally scrollable detail tabs, full payout information, and action controls stack without page-level horizontal overflow (`scrollWidth 375`, viewport width `390`).
- Task and upload behavior: only system-issued Invoice tasks expose upload. The modal shows the system Invoice number, full eligible payout-account identifier, supported formats, 5 MB limit, drag/drop selection, preview, version intent, and current-page recognition progress.
- Inspection behavior: external OCR fields are editable only in allowed states, creator corrections preserve the original recognition snapshot, and confirmation remains disabled until the acknowledgement is checked and every field/account blocker passes.
- Sensitive-data behavior: the current creator sees complete payout values only in their own detail/account comparison. Administrator reuse remains masked, while tasks and notifications omit bank values.
- Timeline behavior: collection/review history and payment progress remain on the same Invoice. Payment-failure recovery shows `审核通过 → 待付款 → 付款处理中 → 付款失败 → 等待修改收款信息 → 收款资料已提交复核 → 等待重新付款 → 付款处理中 → 已付款` without payment execution identifiers.
- Browser console: desktop and mobile checks reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest `149/149` passed; Vite production/Sites build passed; Sites worker tests `4/4` passed; `git diff --check` passed.
- Remaining warning: Vite reports the existing main JavaScript chunk is larger than 500 kB after minification; it does not block the prototype build.
- Environment: local test environment only. Neither `192.168.88.188:8771` nor `192.168.88.188:8772` was connected, modified, restarted, or deployed.

- No actionable P0/P1/P2 findings remain.

final result: passed

## Iteration 81: Payment Correction Resubmission Review

- Visual source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-1f5d190d-b226-45d2-aa51-3697acf821f5.png` at `1755 x 815`.
- Desktop implementation: `qa/invoice-payment-correction-review-submitted-viewport.jpg` at `1740 x 808`, captured from `/invoices/INV-260728-R` after a corrected payout account passed Airwallex validation and was submitted.
- Mobile implementation: `qa/invoice-payment-correction-review-submitted-mobile.jpg` at the browser's `375 x 844` content viewport under the `390 x 844` responsive override.
- Focused comparison: `qa/invoice-payment-correction-review-comparison.png` places the source's payment-failure processing card and the implementation's post-submission review state together at the same `390 x 620` crop size.
- Flow behavior: `重新发起付款` is replaced by `提交审核`. The action remains disabled until the affected payout field changes, Airwallex Schema validation passes, and the payout profile is saved.
- State transition: the only allowed payment-correction transition is `PAYMENT_FAILED → PENDING_REVIEW`. Direct `PAYMENT_FAILED → APPROVED` progression is rejected.
- Timeline behavior: after submission, `资料审核` becomes the active processing node and `完成付款` returns to `待开始`; the UI states that review has restarted from the data-review node.
- Persistence: successful resubmission stores `paymentIssue.resubmittedAt`, updates the Invoice and matched request project to `PENDING_REVIEW`, and removes payment-failure-only actions from the detail page.
- Interaction evidence: browser QA changed the failing bank-account field, completed Airwallex validation, saved the payout profile, returned to the Invoice, submitted it, and observed `待审核 / 资料审核处理中 / 完成付款待开始`.
- Responsive result: the desktop page and `390 x 844` mobile layout reported no horizontal overflow. The processing card, status nodes, notice, and download action remain readable and operable on both.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest `92 / 92` passed; Vite production build and Sites packaging passed; Sites worker tests `4 / 4` passed; `git diff --check` passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

The supplied screenshot documents the former payment-failure continuation state. The implementation intentionally diverges after the new `提交审核` action: the failure node is cleared, `资料审核` becomes current, and payment is no longer resumed directly. The existing COMETS processing-card anatomy, white surface, timeline density, status colors, and download action remain visually consistent. No actionable P0/P1/P2 finding remains.

final result: passed

### Iteration 82: Five Required Airwallex Payment Fields

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-30f64209-99e8-4996-af7c-1b6288eef4b4.png` (1516 x 435 px at 1x). The user's accompanying requirement supersedes the source field set by making `Account name`, `Account number`, `Bank name`, `Bank address`, and `SWIFT code` mandatory in every scenario.
- Browser-rendered full implementation: `/Users/aria/Documents/支付系统c端/qa/airwallex-five-required-fields-final-full.png` (1502 x 891 px browser-content capture from the 1517 x 900 viewport override).
- Focused implementation: `/Users/aria/Documents/支付系统c端/qa/airwallex-five-required-fields-final.png` (1182 x 500 px).
- Side-by-side focused comparison: `/Users/aria/Documents/支付系统c端/qa/airwallex-five-required-fields-final-comparison.png` (2722 x 900 px).
- Density normalization: source and implementation were both captured at 1x. The comparison helper preserved each image's native scale and aligned both images at the top of a 900 px comparison canvas.
- Route and state: local `/profile`, Airwallex account edit mode, Japan / EUR / LOCAL scenario, with the two newly absent required values showing field-level validation errors. The remote Mac environment was not updated.
- Full-view evidence: the payment-information card preserves the existing COMETS profile hierarchy, card anatomy, action placement, and desktop content width. The page reported `scrollWidth === clientWidth`.
- Focused evidence: all five required fields appear before the scenario-specific bank code, branch code, and account-type fields. The reference's two-column rhythm, compact labels, input heights, neutral borders, and coral validation treatment are retained.
- Primary interactions tested: registration transfer method changed from LOCAL to SWIFT and retained all five required fields; account editing blocked save when Bank address and SWIFT were empty; the same five fields remained present at 768 px and 390 px widths.
- Responsive evidence: 768 px iPad and 390 px mobile checks reported zero overflowing inputs/selects. The mobile page reported `scrollWidth === clientWidth` and stacked the payment fields into one column.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 93/93 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- Comparison history:
  - Pass 1 found a P2 layout-rhythm issue: `Bank address` spanned the full grid, leaving an unused half-row beside `Bank name`.
  - Fix: removed the profile-only full-width override so `Bank name` and `Bank address` share one row while mobile continues to stack them.
  - Pass 2 evidence is the final focused comparison above. The empty grid track is gone and no actionable P0/P1/P2 issue remains.

- Required fidelity surfaces:
  - Fonts and typography: the established compact bilingual label hierarchy, font family, weight, line height, and fixed 8.5 px Schema placeholder treatment remain unchanged and readable.
  - Spacing and layout rhythm: the final desktop card uses balanced two-column rows; iPad and mobile stack cleanly without clipping or overflow.
  - Colors and visual tokens: the neutral card, gray inputs, amber bank icon, coral validation background/border, and dark label tokens match the existing system and source reference.
  - Image quality and asset fidelity: the existing COMETS mark and Lucide bank icon remain sharp; no source asset was replaced or approximated.
  - Copy and content: the five user-mandated bilingual fields are marked required. Airwallex Schema fields such as bank code, branch code, account type, routing number, or IBAN remain conditional.

final result: passed

## Iteration 74: Reference-Style Administrator Pagination

- Visual source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-bf8ffc8d-47ca-4b61-8e0d-886ce422e7c4.png` at `309 x 54`.
- Implementation evidence: `qa/admin-pagination-reference-style-focused.png` at `309 x 54`, captured from `/admin/invoices` in the default `1280 x 720` browser viewport.
- Focused comparison: `qa/admin-pagination-reference-style-comparison.png` at `642 x 900`, placing the source and implementation together for direct visual review.
- Mobile evidence: `qa/admin-pagination-reference-style-mobile.jpg` at the browser's captured `375 x 812` content viewport under the `390 x 844` responsive override.
- Component anatomy: the control now uses `共{n}条 → previous → compact page numbers → next → {size}条/页`, with borderless ordinary controls, a purple circular current-page outline, muted disabled arrows, and a compact rounded page-size selector.
- Data-state note: the reference contains 21 records and therefore shows pages `1` and `2`; the current Invoice seed contains 12 records and correctly shows only page `1`. Visual comparison focuses on the shared control anatomy rather than inventing additional Invoice data.
- Direct-page behavior: large page sets keep compact ellipses; selecting an ellipsis exposes the existing valid-page numeric entry without adding a permanently visible jump control.
- Interaction result: the page-size selector changed from `20条/页` to `50条/页` and back; current-page and disabled-arrow states remained correct. Pagination helper tests cover `20 / 50 / 100`, multi-page slicing, page clamping, ellipsis tokens, and direct valid-page targets.
- Responsive result: the mobile footer remained a single line, measured `353 px` wide, and the document reported `0 px` horizontal overflow.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest `82 / 82` passed; Vite production build and Sites packaging passed; Sites worker tests `4 / 4` passed; `git diff --check` passed.
- Environment: local test environment only; `192.168.88.188:8772` was not updated.

No actionable P0/P1/P2 finding remains.

final result: passed

### Iteration 79: User-Defined Payout Account Names

- Source reference: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-7139bc62-d3ad-49f5-9250-bca21e8f0dc9.png`.
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/payout-account-name-desktop.png`.
- iPad implementation: `/Users/aria/Documents/支付系统c端/qa/payout-account-name-ipad.png`.
- Mobile account list: `/Users/aria/Documents/支付系统c端/qa/payout-account-name-mobile.png`.
- Mobile account editing: `/Users/aria/Documents/支付系统c端/qa/payout-account-name-mobile-edit.png`.
- Side-by-side comparison: `/Users/aria/Documents/支付系统c端/qa/payout-account-name-comparison.png`.
- Account model: every payout account has a dedicated internal display name that is distinct from the Airwallex beneficiary account holder name.
- Creation behavior: a new Airwallex account starts unnamed, renders the temporary card label `未命名 Airwallex 账户`, and cannot be saved until a 2–40 character account name is provided.
- Editing behavior: `编辑账户` exposes `付款账户名称 / Payout account name *` at the top of the payout-information form. The account card previews the draft name immediately, successful saving persists the normalized name, and cancellation restores the saved name.
- Validation: empty, one-character, and over-40-character names are blocked with field-level and dialog feedback. Repeated whitespace is normalized on save.
- Edit-mode separation: social accounts and Invoice contact fields remain read-only, account operation menus are hidden, the top profile save action is absent, and only the bottom `取消 / 保存修改` actions are available.
- Responsive behavior: desktop, `768×1024` iPad, and `390×844` mobile layouts have no page-level horizontal overflow. Mobile stacks the channel controls and account cards, while the bilingual name field and bottom actions remain fully visible.
- Data hygiene: browser QA renamed the default account, confirmed persistence, restored the original name, and cancelled the temporary new-account draft. Existing local payout data was preserved.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.
- Visual assessment: the naming field extends the existing COMETS form anatomy without changing the established channel tabs, account-card hierarchy, status treatments, or menu placement. No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 80: Payout Alias Configuration Card

- Source visual truth:
  - `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-b24306c0-a376-429a-99fc-5b1d345e745c.png` (`986 × 485`, 1x) for removing the highlighted four-item payout overview row.
  - `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-e8676f1d-b7d5-4b61-b53c-2bea1fb00b00.png` (`951 × 206`, 1x) for the standalone account-configuration card.
- Read-only desktop implementation: `/Users/aria/Documents/支付系统c端/qa/payout-alias-account-list-desktop.png` (`1100 × 375`, focused 1x crop).
- Account-configuration desktop implementation: `/Users/aria/Documents/支付系统c端/qa/payout-account-config-desktop.png` (`1100 × 220`, focused 1x crop).
- Responsive implementation: `/Users/aria/Documents/支付系统c端/qa/payout-account-config-ipad.png` from the `768 × 1024` viewport and `/Users/aria/Documents/支付系统c端/qa/payout-account-config-mobile.png` from the `390 × 844` viewport.
- Full comparisons: `/Users/aria/Documents/支付系统c端/qa/payout-alias-account-list-comparison.png` and `/Users/aria/Documents/支付系统c端/qa/payout-account-config-comparison.png`.
- Current-state override: this iteration supersedes Iteration 79's placement and wording. The former `当前渠道 / 账户总数 / 可用账户 / 档案完整度` row is removed, and the field is now `账户别名 *` with the secondary label `Internal nickname`.
- Information architecture: the alias is no longer part of the Airwallex payout-information card. During account creation or editing, a standalone `账户配置` card appears before `付款场景` and states that the value is an internal MUSE Pay field that is not submitted to the Airwallex Beneficiary API.
- Interaction evidence: existing-account editing previews alias changes on its account card; a one-character alias is blocked with field-level and dialog feedback; cancellation restores the saved alias. New-account creation starts with an empty alias and is blocked with `请填写账户别名` before Airwallex field validation.
- Responsive evidence: desktop, iPad, and mobile reported `documentElement.scrollWidth === documentElement.clientWidth`. The desktop input keeps the source's constrained width, while mobile expands it to the card width. The card header, explanatory copy, alias field, and input remain fully visible.
- Comparison history: the first desktop edit capture revealed that the fixed topbar obscured the configuration-card heading after automatic scrolling. Adding an `80px` scroll margin fixed the issue; the revised capture shows the complete header and field. No other actionable P0/P1/P2 mismatch remains.
- Required fidelity surfaces:
  - Fonts and typography: the compact title, muted helper copy, 10px label hierarchy, and 8.5px `Internal nickname` text match the supplied operational UI.
  - Spacing and layout rhythm: the white card shell, divided header, light body band, constrained input width, and placement before the payout-scenario card reproduce the selected source composition.
  - Colors and visual tokens: the blush icon container, white shell, neutral border, gray body surface, and existing green/lilac payout states remain consistent with the source and system palette.
  - Image quality and asset fidelity: the existing Lucide `Landmark` icon is used at the established 32px profile-card icon anatomy; no placeholder or handcrafted SVG asset was introduced.
  - Copy and content: the card title, internal-field disclosure, `账户别名 *`, and `Internal nickname` copy match the selected source.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest `91 / 91` passed; Vite production build and Sites packaging passed; Sites worker tests `4 / 4` passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 78: Payout-Account-Only Editing

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-06e870f7-cabd-483a-a0fa-4315240b3655.png` (1445 x 560 px at 1x) for the payout-account card and menu composition, plus `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-a8aac3d8-971a-4d81-b08b-81ab2a38e605.png` (214 x 114 px at 1x) for the focused menu treatment.
- Read-only implementation evidence: `/Users/aria/Documents/支付系统c端/qa/iteration-78-profile-account-menu-desktop.png` (1430 x 759 px browser-content capture from a 1445 x 767 CSS viewport).
- Account-section crop: `/Users/aria/Documents/支付系统c端/qa/iteration-78-profile-account-section-focus.png` (1390 x 530 px).
- Full-view comparison: `/Users/aria/Documents/支付系统c端/qa/iteration-78-account-section-comparison.png` (2859 x 900 px), containing the supplied source and rendered implementation in one artifact.
- Focused menu comparison: `/Users/aria/Documents/支付系统c端/qa/iteration-78-account-menu-focus-comparison.png` (1304 x 900 px), containing the source and implementation menu at normalized 640 px widths.
- Editing-state evidence: `/Users/aria/Documents/支付系统c端/qa/iteration-78-profile-account-edit-desktop-viewport.png` (1425 x 891 px from a 1440 x 900 CSS viewport), `/Users/aria/Documents/支付系统c端/qa/iteration-78-profile-account-edit-ipad-viewport.png` (753 x 1004 px from a 768 x 1024 CSS viewport), and `/Users/aria/Documents/支付系统c端/qa/iteration-78-profile-account-edit-mobile-viewport.png` (375 x 812 px from a 390 x 844 CSS viewport). Captures use device scale factor 1; browser chrome and scrollbars account for the small pixel difference from the CSS viewport.
- Route and state: authenticated creator profile at `/profile` in the local test environment. The Mac user environment at `192.168.88.188:8772` was not updated.
- Interaction scope: selecting `编辑账户` opens an isolated `PAYOUT_ACCOUNT` edit mode. Social accounts, certification files, and all five Invoice contact inputs remain read-only. The four payout-scenario selects, six active Schema fields, and supplemental payout fields remain editable.
- Action placement: the page-heading `保存修改` action and every payout-card `MoreHorizontal` trigger are absent during account editing. A single `取消 / 保存修改` pair appears at the bottom-right of the Airwallex information card; at mobile width the two buttons share the available row without overflow.
- Cancel behavior: clicking the bottom `取消` restores the page-heading `编辑档案` action, both payout-account menus, read-only payout fields, and the saved account data.
- Save behavior: clicking the bottom `保存修改` displays the blocking `校验中` dialog, completes Airwallex Schema and Beneficiary validation, then displays the explicit `保存成功` dialog. After success, edit mode closes and the page-heading action and account menus return.
- Responsive behavior: 1440 px desktop, 768 px iPad portrait, and 390 px mobile reported no horizontal overflow. The edit footer remained inside the payout-information card with stable spacing and touch-friendly controls.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 90/90 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed; `git diff --check` passed.

- Required fidelity surfaces:
  - Fonts and typography: menu labels, account titles, bilingual payout labels, helper copy, and action-button text retain the established COMETS hierarchy and do not wrap unexpectedly.
  - Spacing and layout rhythm: the source card/menu anatomy is preserved; the edit footer uses the card divider, 14 px top padding, 8 px action gap, and 38 px control height already used by the profile.
  - Colors and visual tokens: the source-aligned white surfaces, lilac active account border, light-purple menu hover state, green verification badges, and black primary save action remain consistent with the current system palette.
  - Image quality and asset fidelity: the supplied COMETS mark and Lucide `Pencil`, `Ban`, `MoreHorizontal`, and status icons remain sharp; no placeholder, handcrafted SVG, or CSS-drawn asset was introduced.
  - Copy and content: the visible edit scope and action labels match the written requirement exactly. No social or Invoice edit affordance is shown while editing a payout account.

- Comparison history: the first combined comparison found no actionable P0/P1/P2 visual mismatch. The source screenshot's red outline is treated as user annotation, not product chrome. The implementation intentionally retains the existing fixed sidebar and responsive content cap outside the focused payout section.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Iteration 77: Payout Channel Account Grouping

- Source visual truth:
  - `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-38e96635-31f2-4871-8fea-db85a457901c.png` (1446 x 462 px at 1x) for the account-card, summary, status, and action anatomy.
  - `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-dd08457c-318a-43ed-9dab-afb5a4090b74.png` (973 x 185 px at 1x) for the three-channel selector and selected/unavailable states.
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/payout-channel-desktop-full.jpg` (1284 x 882 px browser-content capture from the normal desktop viewport).
- Focused implementation: `/Users/aria/Documents/支付系统c端/qa/payout-channel-accounts-desktop.jpg` (964 x 420 px at 1x).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/payout-channel-mobile-320.jpg` (305 x 763 px browser-content capture from a 320 x 800 CSS viewport).
- Combined comparison: `/Users/aria/Documents/支付系统c端/qa/payout-channel-comparison.png` (3431 x 900 px), placing both supplied references and the final Airwallex state in one visual artifact.
- Route and state: `http://localhost:4173/profile`, authenticated creator profile, Airwallex selected, two available Airwallex accounts, one pending PayPal account, and no PayerMax account. Local test environment only; `192.168.88.188:8772` was not updated.
- Density normalization: both source references and the focused implementation are 1x raster captures. The comparison board preserves native source scale up to its 900 px height cap; the focused implementation is cropped from the browser capture without resampling.
- Full-view evidence: the established profile hierarchy remains intact. The payout section keeps its white operational card, green header icon, availability badge, compact metrics, account cards, default star, menu controls, and footer actions.
- Focused evidence: the three selectors use the reference's equal-width desktop layout, lilac selected state, dashed unavailable states, compact two-line labels, and `Airwallex → PayPal → PayerMax` order. Beneficiary status and generation counts are absent.
- Interaction evidence: selecting Airwallex shows both Airwallex accounts; selecting PayPal shows the existing PayPal account and its pending state; selecting PayerMax shows an accessible empty tab panel. Account menus and default-account behavior remain available within the selected channel.
- Responsive evidence: iPad and desktop keep the three-column selector. At 320 px the three selectors stack so all platforms remain visible, account cards use one column, selector `scrollWidth` equals `clientWidth`, and the page width remains 320 px.
- Browser console: zero warnings and zero errors.
- Automated verification: Vitest 90/90 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- Comparison history:
  - Initial implementation issue: the empty PayerMax account grid was hidden with `display: none`, which removed the selected tab's controlled `tabpanel` from the accessibility tree. Fix: the channel notices, empty state, and account grid now share one persistent tab panel. Post-fix Browser evidence found one `PayerMax 付款账户` panel containing the correct unavailable empty-state copy.
  - Initial mobile issue: the horizontal selector placed PayerMax outside the first viewport. Fix: phone widths stack all three channel selectors; the final 320 px capture shows every platform without horizontal selector overflow.

- Required fidelity surfaces:
  - Fonts and typography: the existing compact COMETS operational type scale is preserved; selector labels and account metadata match the reference hierarchy without clipping.
  - Spacing and layout rhythm: desktop selectors retain equal tracks, 8 px gaps, 7 px radii, and compact 64 px height; account cards keep the established three-column desktop grid and single-column phone layout.
  - Colors and visual tokens: Airwallex uses the reference-aligned lilac selected treatment, unavailable channels use neutral dashed surfaces, and account verification/default semantics retain green and amber accents.
  - Image quality and asset fidelity: no new raster assets were required; existing COMETS assets and Lucide icons remain sharp and no placeholder or handcrafted icon was introduced.
  - Copy and content: Beneficiary status is not creator-visible; channel counts, availability labels, masked identifiers, account statuses, and empty-state guidance reflect the selected channel.

- No actionable P0/P1/P2 findings remain.

final result: passed

## Iteration 76: Multi-account Payout Profile

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-870fac66-99e7-4266-91cb-4cb6a7effeff.png` (1125 x 865 px at 1x). The source is an administrator edit modal, so it is used as the visual truth for payout-card anatomy, density, icon treatment, default-star state, and add-account actions rather than for the creator page shell.
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/payout-accounts-desktop-1440.png` (1425 x 891 px browser-content capture from a 1440 x 900 CSS viewport at 1x).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/payout-accounts-mobile-320.png` (305 x 743 px browser-content capture from a 320 x 780 CSS viewport at 1x).
- Interaction evidence: `/Users/aria/Documents/支付系统c端/qa/payout-accounts-mobile-320-menu.png`, `/Users/aria/Documents/支付系统c端/qa/payout-accounts-mobile-320-default-dialog.png`, and `/Users/aria/Documents/支付系统c端/qa/payout-accounts-mobile-320-delete-dialog.png`.
- Side-by-side comparison: `/Users/aria/Documents/支付系统c端/qa/payout-accounts-comparison.png`; the supplied payout-card reference and the final desktop profile are rendered together at 1x density.
- State: authenticated creator profile with three payout accounts, including a default verified Airwallex account, a verified Airwallex backup account, and a pending-confirmation PayPal account. The default-replacement and physical-deletion dialogs were captured before mutation.
- Full-view evidence: the creator profile preserves the management profile's compact white cards, neutral borders, pale provider icons, three-column desktop layout, masked account summaries, status badges, and bottom-aligned add-account actions. The creator-specific overview metrics and missing-information notice are intentional functional additions.
- Focused evidence: every card has a permanently visible `MoreHorizontal` control. The default star is fixed directly beside the top-right menu, and the former standalone `设为默认` action is absent.
- Responsive evidence: 1024 x 768 and 768 x 1024 retain two payout-account columns. At 320 x 780, accounts become a single 258 px column, metrics become two columns, the menu remains within the viewport, and both confirmation dialogs remain fully operable without horizontal overflow.
- Interaction evidence: opening a menu focuses its first item; outside click and Escape close menus; Enter activates focused menu items. Delete and default-replacement dialogs focus `取消`, Escape cancels, and default replacement remains disabled until another usable account is selected.
- Business-rule evidence: draft-like unlinked accounts resolve to deletion; verified, Beneficiary-backed, or historically linked accounts resolve to disabling; review, validation, payment-processing, or active-payment accounts are locked. Default replacement and destructive mutation persist atomically through the profile service.
- Browser console: no warning or error entries were present after the final reload. Vite development connection and Fast Refresh diagnostics were debug/info only.
- Automated verification: TypeScript passed; Vitest 89/89 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

- Comparison history:
  - First pass: [P2] the default star followed the account name instead of occupying the card's top-right status area.
  - Fix: moved the star into the right-side action cluster directly before the `MoreHorizontal` trigger and made that grid track content-sized.
  - Post-fix evidence: desktop and 320 px captures show the star and menu aligned together without clipping, title compression, or horizontal overflow.

- Required fidelity surfaces:
  - Fonts and typography: the established COMETS UI family, compact card-title hierarchy, muted masked identifier, and small status labels match the source density.
  - Spacing and layout rhythm: 8 px card radii, restrained borders, compact internal gaps, three-column desktop composition, and single-column mobile stacking preserve the source's operational rhythm.
  - Colors and visual tokens: provider icons use pale lilac and blue, the default star uses amber, verified states use pale green, and pending confirmation uses pale amber within the existing system palette.
  - Image quality and asset fidelity: the existing COMETS vector mark remains sharp; account and action controls use the project's Lucide icon family without custom-drawn substitutes.
  - Copy and content: account names, provider, currency, masked identifier, statuses, destructive confirmations, disabled reasons, success messages, and empty-state guidance match the requested product rules.

- No actionable P0/P1/P2 findings remain.

final result: passed

## Iteration 75: Contract Payment Status Display Labels

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-2ec0eaae-2e01-4105-b709-e78dece2eb07.png` (1283 x 763 px at 1x).
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/contract-payment-labels-desktop.png` (1268 x 754 px browser-content capture from a 1283 x 763 viewport override at 1x).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/contract-payment-labels-mobile.png` (375 x 812 px browser-content capture from a 390 x 844 viewport override at 1x).
- Full-view comparison evidence: `/Users/aria/Documents/支付系统c端/qa/contract-payment-labels-comparison.png`, placing the supplied source and desktop implementation in one comparison image.
- Focused-region comparison was not needed because the only requested change is clearly legible in the overview labels, filter tabs, and all eight list badges in the full-view comparison.
- Scope: visible contract status labels changed from `未请款 / 请款中 / 已付款` to `未付款 / 付款中 / 已付款`. Internal contract status values, Invoice matching, counts, filtering predicates, and lifecycle progression remain unchanged.
- Creator list verification: overview is `未付款 3 / 付款中 4 / 已付款 1`; the two renamed filters return 3 and 4 contracts respectively; all eight desktop and mobile badges use the new labels.
- Detail verification: the status board and accessible current-state label use `未付款 → 付款中 → 已付款`, with no legacy display copy.
- Administrator consistency: administrator contract summaries, filters, tables, mobile cards, request-linked contract fields, and user-detail contract records reuse the same display-label mapping without changing their underlying records.
- Responsive behavior: the 375 px mobile content viewport renders all eight contract cards with `scrollWidth === clientWidth`; the drawer was closed before final capture.
- Browser console: the fresh final contract-list tab reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 83/83 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed; `git diff --check` passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

- Required fidelity surfaces:
  - Fonts and typography: existing font family, sizes, weights, line heights, and badge hierarchy are unchanged; the two-character replacements fit without wrapping or truncation.
  - Spacing and layout rhythm: summary cards, toolbar, table columns, mobile cards, radii, shadows, and vertical rhythm are unchanged.
  - Colors and visual tokens: purple, blue, and green semantic status treatments remain identical to the source-aligned implementation.
  - Image quality and asset fidelity: the COMETS logo and Lucide interface icons remain unchanged and sharp; no new image assets were required.
  - Copy and content: only the requested contract status fields changed. Supporting descriptions, project data, amounts, dates, counts, and action labels remain intact.

- Comparison history: the first combined comparison found no actionable P0/P1/P2 issue. The source's legacy status copy is intentionally superseded by the user's requested payment-oriented labels, while layout and visual treatment remain the same.
- No actionable P0/P1/P2 findings remain.

final result: passed

## Iteration 73: Administrator List Pagination

- Product requirement: every complete administrator list supports pagination with `20 / 50 / 100` rows per page and direct navigation to a specified page.
- Main-module coverage: `/admin` request projects, `/admin/contracts`, `/admin/invoices`, `/admin/settings/users`, and `/admin/settings/audit-logs` each render one shared pagination control.
- User-detail coverage: creator contracts, Invoices, and request projects each render pagination; the activity tab independently paginates login history, notifications, and account-specific audit records.
- Dashboard scope: compact `需要处理` and `最近操作` panels remain six-item previews because their complete data is available in the paginated user and audit modules.
- Interaction result: page-size selection accepts `20`, `50`, and `100`; previous/next and page-number buttons use correct disabled/current states; direct entry clamps invalid values to the nearest valid page; pressing Enter in the jump input performs the same action.
- Filter behavior: request, contract, Invoice, user, and audit filters reset their list to page 1. User bulk selection targets the current page without clearing selections from another page, while CSV exports retain the complete filtered data set.
- Desktop evidence: `qa/admin-pagination-desktop-final.png` at the default 1280 x 720 browser viewport.
- Mobile evidence: `qa/admin-pagination-mobile-bottom-final.png` at a 390 x 844 viewport; the pagination surface measures 353 px wide, stacks its controls without clipping, and reports no horizontal overflow.
- Browser result: all five main routes expose the same `20/50/100` options, all user-detail list tabs expose pagination, and the console contains no warning or error entries.
- Automated verification: TypeScript passed; Vitest 82/82 passed; Vite production build passed; Sites worker tests 4/4 passed; `git diff --check` passed.

### Required Fidelity Surfaces

- Component anatomy: pagination combines a visible result range, page-size select, icon-based previous/next controls, compact numbered pages, and an explicit jump input and command.
- Responsive layout: desktop keeps the result range left-aligned and controls right-aligned; tablet wraps cleanly; mobile stacks page size, page navigation, and direct jump into stable rows.
- Accessibility: navigation has a scoped pagination label, page buttons expose `aria-current`, previous/next buttons have labels and tooltips, and the numeric jump input supports keyboard submission.
- State boundaries: page size is local to each list, filter changes reset only the affected list, and summary totals remain based on the full unpaginated data set.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 72: Administrator Multi-Creator Invoice Data

- Data goal: enrich the administrator Invoice module with records owned by the same creator accounts shown in user management, while preserving contract and request-project relationships.
- Browser state: authenticated system administrator at `/admin/invoices`.
- Invoice result: the system-wide total increased from 5 to 12 and is distributed by Creator ID as `CREATOR-001: 5`, `CREATOR-002: 2`, `CREATOR-003: 2`, `CREATOR-004: 2`, and `CREATOR-005: 1`.
- Status result: `待签署 3`, `待审核 2`, `已通过审核 2`, `付款异常 2`, and `已打款 3`.
- Cross-module evidence: `INV-260730-CD-01` displays `Lumière 夏季护肤合作 / Camille Dubois / CREATOR-002 / EUR 3,600`; the contract module displays the same creator, project ID, project name, brand, and amount under `CON-260703-CD-01`, with its status derived as `请款中`.
- Detail evidence: the new Camille Dubois Invoice opens at `/admin/invoices/CREATOR-002/INV-260730-CD-01` and renders the shared read-only Invoice detail in `待审核`.
- Contract-only behavior: 6 contracts remain without a matching Invoice, keep `未请款`, and do not enter the request-project aggregate.
- Layout result: the 12-row Invoice page retains the 3 x 2 summary, all creator filter options, and no horizontal overflow at the 1265 px desktop viewport.
- List order: administrator records are sorted by issued date descending so the first viewport shows multiple creators instead of grouping all five Léa Martin records first.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest 80/80 passed; Vite production build passed; Sites worker tests 4/4 passed; `git diff --check` passed.

### Data Integrity Rules

- Creator association uses the immutable Creator ID from user management rather than matching by display name or email.
- Project association requires the same Creator ID plus matching project ID and normalized project name.
- Brand and amount mirror the corresponding contract so administrator contract, Invoice, request list, and detail surfaces cannot drift.
- Persisted local Mock databases merge the new external Invoice seeds automatically without requiring local-storage deletion.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 73: Administrator Search And Filter Controls

- Design source: the creator-side Invoice search and payment-channel controls are the interaction and visual reference for every administrator search, select, and date filter.
- Coverage: administrator request projects, contracts, Invoice, user management, operation logs, create-user dialog, and field-correction dialog.
- Desktop evidence: `/Users/aria/Documents/支付系统c端/qa/admin-filters-after-users.png` and `/Users/aria/Documents/支付系统c端/qa/admin-filters-after-audit.png` at `1440×900`.
- Mobile evidence: `/Users/aria/Documents/支付系统c端/qa/admin-filters-after-mobile.png` and `/Users/aria/Documents/支付系统c端/qa/admin-filters-after-mobile-invoices.png` at `390×844`.
- Interaction: all controls use a shared 38 px component anatomy with Lucide leading icons, neutral hover feedback, the creator-side light-purple focus ring, and a restrained active-filter state. Searches expose an accessible clear action only when text is present.
- Business pages: search and creator selection form one filter group while status tabs remain an independent horizontally scrollable group. Mobile stacks search and creator selection before the status navigation.
- User and audit pages: all select filters and audit date inputs use the same component anatomy. Compact default labels avoid truncation at desktop widths.
- Behavior verification: search reduced and restored request/user results, select filters updated the user and audit lists, date filtering produced the expected empty state, and active filters exposed the correct visual state.
- Responsive verification: desktop and `390px` mobile layouts reported zero horizontal overflow. Mobile audit controls measured `342×38`; mobile Invoice controls measured `340×38`, with tables correctly replaced by card lists.
- Browser console: no application errors were observed during the administrator route sweep.
- Automated verification: TypeScript passed; Vitest 80/80 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

- No actionable P0/P1/P2 findings remain.

final result: passed

## Iteration 71: Two-Row Administrator Request Summaries

- Source visual truth: `qa/admin-request-total-card-desktop-final.png` (1304 x 893 px at 1x), combined with the user's explicit instruction that the four administrator request summaries must use two rows because the former single-row layout was too crowded.
- Browser-rendered desktop implementation: `qa/admin-request-summary-two-rows-filtered-equal.jpg` (1304 x 893 px from a 1304 x 893 viewport override, device scale factor 1).
- Additional desktop evidence: `qa/admin-request-summary-two-rows-desktop.jpg` (1265 x 993 px full-page capture from the default 1280 x 720 viewport, device scale factor 1).
- Responsive evidence: `qa/admin-request-summary-two-rows-tablet.jpg` (1009 x 757 px from a 1024 x 768 viewport override) and `qa/admin-request-summary-two-rows-mobile-viewport.jpg` (375 x 812 px from a 390 x 844 viewport override), both at device scale factor 1.
- Equal-size side-by-side comparison: `qa/admin-request-summary-two-rows-comparison.png` (2632 x 900 px), placing the former four-column source beside the final two-column implementation in the same no-result filter state.
- State: authenticated system administrator at `/admin`. Both comparison sides use the search value `不存在的项目`; the summary remains based on all five system request projects while the table is empty.
- Primary interactions tested: project search, clearing search, creator filter availability, status-tab availability, system-wide total persistence and automatic responsive conversion.
- Layout result: desktop and tablet render two equal columns and two equal rows. At 1280 px the four cells measure approximately 492 x 82 px; at 1024 px they measure approximately 489 x 82 px. At 390 px the summaries remain a single 353 px-wide vertical stack.
- Data result: the fourth summary continues to display `5 个项目`, `EUR 1,850 · 1 个项目` and `USD 11,240 · 4 个项目`; changing the card layout does not affect aggregation or filtering logic.
- Overflow and browser result: desktop, tablet and mobile all report zero horizontal overflow. The live page rendered without an application error boundary or new browser warning/error during the CSS-only layout change and filter checks.
- Automated verification: TypeScript passed; Vitest 79/79 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed; `git diff --check` passed.

### Full-View Comparison

`qa/admin-request-summary-two-rows-comparison.png` uses the same viewport dimensions and filter state on both sides. The former four-column band is visibly compressed, while the final 2 x 2 grid gives the multi-currency processing amount and the per-currency project breakdown substantially more horizontal room without changing the page hierarchy.

### Focused Evidence

The equal-size comparison keeps the entire summary region large enough to read each label, primary amount, project count and currency breakdown, so a separate crop is not required. The standalone desktop, tablet and mobile captures verify the final card anatomy at each responsive mode.

### Required Fidelity Surfaces

- Fonts and typography: labels, primary amounts, project counts and currency breakdowns retain their established font family, size, weight, line height and zero letter spacing; no value truncates in the two-column layout.
- Spacing and layout rhythm: the four summaries now form a balanced 2 x 2 matrix with one vertical and one horizontal divider. Existing padding, radius, shadow and surrounding section gaps remain unchanged.
- Colors and visual tokens: all four cells remain on the shared white surface with neutral dividers and the existing amber, blue, green and purple semantic dots.
- Image quality and asset fidelity: the existing COMETS logo and library icons remain unchanged and sharp; no new imagery or placeholder asset was introduced.
- Copy and content: all summary labels, totals, counts and currency values remain unchanged.
- Accessibility and interactions: responsive conversion introduces no hidden content or horizontal scrolling, and the request search, creator filter, status tabs and project links remain available.

### Comparison History

- [P2] The four summaries shared one desktop row, leaving the multi-currency processing amount and project-total breakdown visually crowded.
  Fix: change the administrator-only summary grid to two columns, add a horizontal divider before the second row and preserve mobile's existing single-column stack.
  Post-fix evidence: `qa/admin-request-summary-two-rows-comparison.png` plus the measured desktop, tablet and mobile captures.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 70: Administrator Invoice Two-Row Summary

- Durable feedback: the six-column administrator Invoice overview felt crowded and must use two rows.
- Browser-rendered implementation: `qa/admin-invoice-overview-two-rows-final.png` (1265 x 712 px at device scale factor 1).
- State: authenticated system administrator at `/admin/invoices`, with all five system Invoices loaded.
- Layout result: desktop renders six metrics as a 3 x 2 grid. Each segment is approximately 328 x 98 px, with `Invoice 总数 / 待签署 / 待审核` on the first row and `已通过审核 / 付款异常 / 已打款` on the second row.
- Responsive behavior remains unchanged: tablet uses two columns and mobile uses one.
- Overflow result: the 1265 px desktop viewport reported `scrollWidth === clientWidth`.
- Browser console: no warning or error entries; only Vite connection and React development information were present.
- Automated verification: TypeScript passed; Vitest 79/79 passed; Vite production build passed; `git diff --check` passed.

### Required Fidelity Surfaces

- Spacing and layout rhythm: the larger three-column segments give every label, value, and helper line sufficient breathing room without increasing individual card height.
- Borders: the third segment in each desktop row has no right divider, while the first row retains a complete horizontal divider. Tablet resets the divider pattern for two columns.
- Colors and typography: the existing white summary surface and compact administrator type hierarchy remain unchanged.
- Scope and interactions: only presentation changed; the six values still use unfiltered system-wide Invoice data and the list filters continue to operate independently.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 69: Administrator Invoice Overview

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-08b4904c-b26a-44dc-a772-03cca2f4a303.png` (1066 x 128 px at 1x), showing the requested administrator Invoice overview metrics.
- Browser-rendered desktop implementation: `qa/admin-invoice-overview-desktop-final.png` (1304 x 893 px from the default desktop viewport, device scale factor 1).
- Responsive evidence: `qa/admin-invoice-overview-tablet-final.png` (753 x 1004 px) and `qa/admin-invoice-overview-mobile-final.png` (375 x 812 px), both at device scale factor 1.
- Side-by-side source comparison: `qa/admin-invoice-overview-comparison.png`.
- Responsive comparison board: `qa/admin-invoice-overview-responsive-board.png`.
- State: authenticated system administrator at `/admin/invoices`, with all five system Invoices loaded.
- Data result: the summary displays `Invoice 总数 5`, followed by `待签署 1`, `待审核 1`, `已通过审核 1`, `付款异常 1`, and `已打款 1`.
- Filter independence: switching the list to the `已打款` tab reduced the visible table to one record while all six overview values remained sourced from the unfiltered all-creator Invoice collection.
- Responsive result: desktop uses six equal summary segments, tablet uses a 2 x 3 grid, and mobile stacks all six segments. Desktop, tablet, and mobile reported no horizontal overflow.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest 77/77 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

### Full-View Comparison

`qa/admin-invoice-overview-comparison.png` places the supplied overview reference beside the final administrator Invoice page. The implementation keeps the existing heading and list composition while adding the requested six-metric white segmented surface directly above the Invoice table.

### Required Fidelity Surfaces

- Fonts and typography: labels, values, and helper copy reuse the compact administrator summary hierarchy.
- Spacing and layout rhythm: six equal desktop segments keep the overview concise; responsive breakpoints preserve consistent padding and dividers.
- Colors and visual tokens: the overview uses the same white surface, neutral borders, and restrained shadow as the administrator contract and request summaries.
- Copy and content: the six metrics follow the requested order and use system-wide, unfiltered counts.
- Accessibility and interactions: the overview remains stable while search, creator selection, and status tabs filter only the list below.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 68: Administrator Request Project Total Card

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-2a174596-3d6c-479b-b301-3164462b67b4.png` (1257 x 221 px at 1x), showing the administrator request heading and three existing amount summaries.
- Browser-rendered desktop implementation: `qa/admin-request-total-card-desktop-final.png` (1304 x 893 px from the default desktop viewport, device scale factor 1).
- Responsive evidence: `qa/admin-request-total-card-tablet-final.png` (1009 x 757 px) and `qa/admin-request-total-card-mobile-final.png` (375 x 812 px), both at device scale factor 1.
- Side-by-side source comparison: `qa/admin-request-total-card-comparison.png` (2585 x 900 px).
- Responsive comparison board: `qa/admin-request-total-card-responsive-board.png` (2736 x 900 px).
- State: authenticated system administrator at `/admin`, with all five system request projects loaded. The desktop filter was also changed to a no-result query to verify that the summary remains system-wide.
- Primary interactions tested: request page load, project search, creator filter, status tabs, all-project total rendering and responsive list conversion.
- Data result: `项目总数` displays `5 个项目`; its currency breakdown displays `EUR 1,850 · 1 个项目` and `USD 11,240 · 4 个项目`. Each currency amount and count are calculated dynamically from the unfiltered all-creator request collection.
- Responsive result: desktop uses four equal summary segments, tablet uses a 2 x 2 grid and mobile stacks all four segments. Desktop, tablet and mobile reported no horizontal overflow.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest 77/77 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed; `git diff --check` passed.

### Full-View Comparison

`qa/admin-request-total-card-comparison.png` places the supplied three-summary reference beside the final four-summary implementation. The heading, description, white segmented surface, compact typography and existing amount-summary hierarchy remain intact while the new system-wide project total is appended as the fourth segment.

### Focused Evidence

`qa/admin-request-total-card-desktop-crop.png` keeps all four summary labels, primary values and helper lines readable at desktop density. `qa/admin-request-total-card-responsive-board.png` verifies the four-column, 2 x 2 and single-column compositions in one artifact, including the unfiltered total while the desktop list is empty from search.

### Required Fidelity Surfaces

- Fonts and typography: the fourth segment reuses the existing compact summary label and primary-value typography. Currency breakdowns use a smaller supporting style that remains legible without competing with `5 个项目`.
- Spacing and layout rhythm: the desktop surface is divided into four equal tracks; tablet and mobile breakpoints preserve consistent padding, separators and card height without truncation.
- Colors and visual tokens: the total uses the same white surface, neutral dividers and restrained shadow as the other summaries, with the established purple semantic dot distinguishing the aggregate metric.
- Image quality and asset fidelity: the existing COMETS logo and interface icons remain unchanged; no generated or placeholder imagery was introduced.
- Copy and content: the card clearly communicates the system-wide total and presents every detected currency with both amount and project count.
- Accessibility and interactions: the summary remains independent from list filters, while the request search, creator selector, status tabs and detail actions continue to operate.

### Comparison History

- [P2] The first four-column desktop pass compressed `处理中金额`, causing its multi-currency value to truncate.
  Fix: rebalance the administrator summary tracks and compact only the supporting breakdown typography.
  Post-fix evidence: `qa/admin-request-total-card-desktop-final.png` and `qa/admin-request-total-card-comparison.png`, where `EUR 1,850 · USD 5,340` is fully visible.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 67: Administrator Contract Total Metric

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-710a08d0-5a2d-480c-aa73-aeb34e884a72.png` (1051 x 213 px at 1x), showing the administrator contract heading and three existing status metrics.
- Browser-rendered desktop implementation: `qa/admin-contract-total-summary-desktop.png` (1265 x 712 px from the default 1280 x 720 viewport, device scale factor 1).
- Focused implementation crop: `qa/admin-contract-total-summary-focused-final.png` (1041 x 230 px at 1x).
- Responsive evidence: `qa/admin-contract-total-summary-tablet.png` (753 x 1004 browser-content capture from a 768 x 1024 viewport override) and `qa/admin-contract-total-summary-mobile.png` (375 x 812 browser-content capture from a 390 x 844 viewport override), both at device scale factor 1.
- Side-by-side source comparison: `qa/admin-contract-total-summary-comparison.png` (2116 x 900 px).
- State: authenticated system administrator at `/admin/contracts`, with all eight seeded contracts loaded.
- Primary interactions tested: contract page load, summary-data rendering, status filters and contract table availability after the new metric was added.
- Data result: the first metric displays `合同总数 8`; the remaining metrics display `未请款 3`, `请款中 4`, and `已付款 1`. The three statuses sum to the system-wide total.
- Responsive result: desktop uses four equal 246 px segments; 768 px uses a 2 x 2 grid with 361 px segments; 390 px uses four stacked 353 px rows. Every viewport reported `scrollWidth === clientWidth`.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest 77/77 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

### Full-View Comparison

`qa/admin-contract-total-summary-comparison.png` places the supplied three-status reference beside the updated four-metric summary. The existing heading, description, white segmented surface, compact typography, borders and status copy are preserved. The new `合同总数` metric is inserted first so the reading order is `全部 → 未请款 → 请款中 → 已付款`.

### Focused Evidence

The focused desktop crop keeps all four labels, values and helper lines readable in one comparison. Separate tablet and mobile captures verify that the added metric does not compress text or overflow at narrower widths.

### Required Fidelity Surfaces

- Fonts and typography: the new metric reuses the exact label, value and helper typography of the existing status metrics, including font family, weights, line heights and zero letter spacing.
- Spacing and layout rhythm: four equal desktop segments preserve the reference card height and internal padding; responsive layouts switch to two columns and then one without uneven gaps.
- Colors and visual tokens: the total metric uses the same white surface, neutral dividers, dark value and muted supporting copy as the status metrics.
- Image quality and asset fidelity: the page contains only the existing COMETS logo and interface icons; no new raster asset, CSS art or placeholder imagery was introduced.
- Copy and content: `合同总数` and `本系统全部合同` clearly define the unfiltered, system-wide scope. Status labels and helper copy remain unchanged.
- Accessibility and interactions: the four metrics remain inside the semantic `合同概览` region; contract search, filters, view and download actions remain available.

### Comparison History

- [P2] The administrator contract summary exposed only lifecycle buckets, so administrators could not see the system-wide total at a glance.
  Fix: prepend a dynamic `合同总数` metric sourced from the unfiltered administrator contract collection and let the shared responsive summary grid control its layout.
  Post-fix evidence: `qa/admin-contract-total-summary-comparison.png`, the desktop/tablet/mobile captures and the verified `8 = 3 + 4 + 1` result.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 66: Remove Administrator Detail Reminder

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-3b911e93-357b-4d8f-8e5f-d321bf46109e.png` (1830 x 340 px at 1x), with the administrator creator-context reminder explicitly outlined for removal.
- Browser-rendered request implementation: `qa/admin-request-detail-no-context-notice.png` (1304 x 893 px) and aligned top crop `qa/admin-request-detail-no-context-notice-crop.png` (1304 x 340 px), captured at the default desktop viewport and device scale factor 1.
- Contract and Invoice evidence: `qa/admin-contract-detail-no-context-notice.png` and `qa/admin-invoice-detail-no-context-notice.png` (1289 x 883 px at 1x).
- Responsive evidence: `qa/admin-request-detail-no-context-notice-mobile.png` (375 x 812 browser-content capture from a 390 x 844 viewport override, device scale factor 1).
- Side-by-side source comparison: `qa/admin-detail-context-notice-removal-comparison.png` (3158 x 900 px).
- Three-module and mobile board: `qa/admin-detail-context-notice-removal-board.png` (4329 x 900 px).
- State: authenticated system administrator at the request, contract and Invoice detail routes for Léa Martin.
- Primary interactions tested: direct navigation to all three administrator detail routes; linked data and document viewers remained available; pending-signature Invoice actions were checked after the removal.
- Browser result: `.admin-creator-context` count is zero and `以创作者视角只读查看` is absent on all three routes. Request, contract and Invoice pages have no horizontal overflow.
- Read-only result: administrator Invoice detail still exposes only `放大查看`, `下载PDF` and `下载 Invoice`; creator-only mutation controls remain hidden.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest 76/76 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

### Full-View Comparison

`qa/admin-detail-context-notice-removal-comparison.png` places the annotated source beside the updated request detail at the same 340 px content height. The complete outlined reminder is absent, the project heading moves directly below the back link, and the amount/status cards move upward without leaving an empty placeholder.

`qa/admin-detail-context-notice-removal-board.png` confirms the same result across request, contract and Invoice detail pages. Existing business content, status treatments, document readers, processing timelines and navigation remain unchanged.

### Focused Evidence

The 340 px aligned comparison is the focused evidence because the requested change affects only the area between the back link and page heading. The mobile capture verifies that removal also closes the vertical gap at 375 px, with the request heading beginning at 122 px and no horizontal overflow.

### Required Fidelity Surfaces

- Fonts and typography: existing headings, metadata, card labels and document typography are unchanged; removing the notice does not alter font family, weight, line height or wrapping.
- Spacing and layout rhythm: the page-stack spacing now connects the back link directly to the page heading with the established gap; no blank surface or doubled margin remains.
- Colors and visual tokens: the change removes only the white/lilac reminder surface. All status colors, document notices and operational surfaces retain their existing tokens.
- Image quality and asset fidelity: COMETS branding, contract PDF/page preview and formal Invoice image remain untouched and sharp.
- Copy and content: only `以创作者视角只读查看`, its creator identity line and `管理员只读` badge are removed from the three administrator details. Business copy remains intact.
- Accessibility and interactions: removal eliminates an informational note without changing semantic headings, back links, tabs, document controls or route behavior.

### Comparison History

- [P2] A redundant administrator-context reminder occupied the full width above every business detail and pushed the primary content down.
  Fix: remove the shared `AdminCreatorContextNotice` component, all three render sites and its unused CSS block.
  Post-fix evidence: `qa/admin-detail-context-notice-removal-comparison.png`, `qa/admin-detail-context-notice-removal-board.png` and zero matching DOM nodes on all three routes.

No actionable P0/P1/P2 finding remains.

final result: passed

## Iteration 65: Administrator Business Detail Parity

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-85262bdf-4275-4800-9fdd-f19ec1c6104e.png` (1784 x 585 px at 1x), used for the administrator request-list hierarchy and highlighted `查看` entry.
- Browser-rendered request-list implementation: `qa/admin-request-list-view-entry-final.png` (1769 x 580 px from a 1784 x 585 viewport override, device scale factor 1).
- Side-by-side source comparison: `qa/admin-view-entry-comparison.png`; both inputs remain at native scale and are top-aligned on the shared comparison canvas.
- Desktop detail evidence: `qa/admin-request-detail-desktop-viewport-final.png` (1440 x 900 px), `qa/admin-contract-detail-desktop-viewport-final.png` (1425 x 891 px), and `qa/admin-invoice-detail-desktop-viewport-final.png` (1425 x 891 px), captured from a 1440 x 900 viewport override at device scale factor 1.
- Desktop parity board: `qa/admin-detail-parity-desktop-board.png`.
- Mobile detail evidence: `qa/admin-request-detail-mobile-viewport-final.png`, `qa/admin-contract-detail-mobile-viewport-final.png`, `qa/admin-contract-detail-mobile-content-final.png`, `qa/admin-invoice-detail-mobile-viewport-final.png`, and `qa/admin-invoice-detail-mobile-content-final.png` (375 x 812 browser-content captures from a 390 x 844 viewport override, device scale factor 1).
- Mobile parity board: `qa/admin-detail-parity-mobile-board.png`.
- State: authenticated system administrator viewing Léa Martin (`CREATOR-001`) at administrator-scoped request, contract, and Invoice routes.
- Primary interactions tested: opening every request-list `查看` destination; following the linked contract and Invoice from request detail; opening requested and unrequested contract records; switching the contract fulfillment/claim tabs; opening the mobile drawer; expanding and downloading the Invoice document; checking both pending-signature and payment-failure Invoice states.
- Read-only result: administrator Invoice detail exposes only `放大查看`, `下载PDF`, and `下载 Invoice`. `Invoice 信息有误`, `签署 Invoice`, `修改付款信息`, and `重新发起付款` are absent in all administrator states.
- Responsive result: every checked 390 x 844 detail route reported `documentElement.scrollWidth === documentElement.clientWidth === 375`; the contract obligations appear before the document viewer and the 333 px Invoice image remains inside the content width.
- Browser console: no warning or error entries.
- Automated verification: TypeScript passed; Vitest 76/76 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

### Full-View Comparison

`qa/admin-view-entry-comparison.png` shows that the administrator request list retains the supplied compact management-console hierarchy, all-creators filters, dense status table, inline progress, and icon-plus-text `查看` action. Every visible action now targets an administrator-scoped detail route instead of a document shortcut or creator route.

The three desktop detail captures show that the administrator receives the same creator-facing business content: request amount, matched resources and Invoice-driven progress; contract lifecycle, obligations, claim information and the 16-page document viewer; Invoice notices, full document, processing timeline and download access. The only added surface is the compact creator-context notice, which identifies whose data is being inspected and labels the page read-only.

### Focused Evidence

`qa/admin-detail-parity-mobile-board.png` is the focused responsive comparison. It keeps the creator-context notice, request metrics, contract lifecycle and obligations, Invoice processing status and formal document readable at 375 px. Separate scrolled captures were required because the contract obligations and Invoice document cannot both be judged from their mobile first view.

### Required Fidelity Surfaces

- Fonts and typography: the existing COMETS compact sans-serif hierarchy, zero letter spacing, weights, line heights and document typography are unchanged from the creator details; long creator and project metadata truncate or wrap without collision.
- Spacing and layout rhythm: 224 px desktop navigation, compact white information surfaces, creator-context strip, two-column workspaces and mobile stacking preserve the existing operational density and 8 px-or-smaller radii.
- Colors and visual tokens: neutral page canvas, white cards, restrained lavender context treatment and existing semantic status colors remain consistent with both the supplied administrator reference and creator detail pages.
- Image quality and asset fidelity: the COMETS mark, Lucide controls, supplied 16-page contract PDF/page preview and formal Invoice source image remain unchanged and sharp. No document or icon was replaced with CSS art or placeholder imagery.
- Copy and content: request, contract and Invoice titles, identifiers, amounts, statuses, timelines, obligations, notices and file metadata come from the same creator data source. Administrator-only copy is limited to the creator identity and read-only notice.
- Accessibility and interactions: headings, notes, tabs, buttons and links remain semantic; the mobile drawer is keyboard-addressable; the Invoice reader can be expanded and closed with Escape; no creator mutation control is present in administrator mode.

### Comparison History

- [P1] Administrator list actions previously lacked creator-equivalent detail destinations.
  Fix: add administrator-scoped request, contract and Invoice detail routes and point desktop/mobile `查看` actions to them.
  Post-fix evidence: `qa/admin-view-entry-comparison.png` and the route destinations recorded in browser verification.

- [P1] Administrator business detail could have diverged from creator content or exposed creator mutations.
  Fix: reuse the three creator detail components with administrator-scoped data, preserve linked-resource routing, and gate every signing, feedback, payout-edit and payment-retry action behind creator mode.
  Post-fix evidence: `qa/admin-detail-parity-desktop-board.png`, `qa/admin-detail-parity-mobile-board.png`, and the payment-failure button audit.

- Initial post-fix visual comparison found no remaining actionable P0/P1/P2 issue.

final result: passed

## Iteration 64: Administrator Information Architecture

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-6682ae8d-9049-4415-b0ee-3eaefdf901e5.png` (243 x 372 px at 1x), used as the sidebar hierarchy reference.
- Browser-rendered desktop implementation: `/Users/aria/Documents/支付系统c端/qa/admin-business-desktop-final.png` (1440 x 900 px at a 1440 x 900 viewport override, device scale factor 1).
- Focused sidebar implementation: `/Users/aria/Documents/支付系统c端/qa/admin-sidebar-focused-final.jpg` (224 x 372 px at 1x).
- Side-by-side focused comparison: `/Users/aria/Documents/支付系统c端/qa/admin-sidebar-comparison.png` (488 x 900 px). The source and implementation retain their native 372 px content height and are top-aligned on a shared comparison canvas.
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/admin-business-mobile-closed-final.png` and `/Users/aria/Documents/支付系统c端/qa/admin-navigation-mobile-open-final.png` (375 x 812 px browser-content captures at a 390 x 844 viewport override, device scale factor 1).
- State: authenticated system administrator at `/admin`, with creator-wide request-project data and the responsive navigation drawer.
- Required navigation: `请款项目`, `合同`, `Invoice`, and expandable `系统设置`; its child routes are `用户管理` and `操作日志`.
- The business modules are administrator-wide, read-only aggregations. Request projects are the normalized contract/Invoice intersection; contracts include unrequested contracts; Invoices include all creator Invoices.
- Seeded aggregate result: the administrator sees 5 request projects, 8 contracts, and 5 Invoices. Request summaries and progress are derived from Invoice state, while the three contracts without Invoices remain exclusive to the contract module.
- Primary interactions tested: opening and closing the mobile drawer; expanding `系统设置`; navigating to `用户管理` and `操作日志`; loading the contract and Invoice modules; filtering controls remained available on each business page.
- Responsive evidence: at the 390 x 844 override, the measured page width was 375 px and `documentElement.scrollWidth === documentElement.clientWidth`. Desktop tables are hidden, mobile cards are visible, and the closed 286 px drawer ends at `right: -5.72px`, fully outside the viewport.
- Browser console: no warning or error entries; only Vite connection messages and the React development-tools information message were present.
- Automated verification: TypeScript passed; Vitest 75/75 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

### Full-View Comparison

The supplied image is a narrow management-console sidebar reference rather than a complete page, so the desktop homepage and mobile drawer were validated as supporting full-view evidence. The implementation preserves the reference's compact white navigation, dark line icons, restrained text hierarchy, right-side chevrons, and settings grouping. The information architecture is intentionally reduced to the four administrator areas requested by the user.

### Focused Evidence

`qa/admin-sidebar-comparison.png` makes the relevant hierarchy and visual rhythm directly readable. `qa/admin-navigation-mobile-open-final.png` verifies the same hierarchy in the mobile drawer, including the expanded `用户管理` and `操作日志` children. No additional focused crop was needed because all navigation labels, icons, active state, and indentation remain legible.

### Required Fidelity Surfaces

- Fonts and typography: the established compact COMETS sans-serif hierarchy, weights, line heights, wrapping, and zero letter spacing are preserved.
- Spacing and layout rhythm: the 224 px desktop sidebar, 42 px first-level rows, 36 px child rows, restrained 8 px radii, and mobile 286 px drawer reproduce the reference's operational density without overlap.
- Colors and visual tokens: white surfaces, neutral dividers, dark text, muted icons, and the existing light coral COMETS active state remain consistent with the product.
- Image quality and asset fidelity: the supplied COMETS mark and Lucide interface icons remain sharp. No reference asset was replaced with CSS art, text symbols, or placeholder imagery.
- Copy and content: navigation labels match the requested administrator modules; business descriptions explicitly communicate creator-wide aggregation and read-only external data.

### Comparison History

- Initial comparison found no actionable P0/P1/P2 visual mismatch. The implementation intentionally omits unrelated management-console modules from the reference because the user's latest scope is limited to request projects, contracts, Invoices, user management, and audit logs.
- Browser verification confirmed that the earlier full-page fixed-element duplication was a capture artifact. A normal viewport screenshot shows one topbar and one drawer with no duplicated or overlapping navigation.

No actionable P0/P1/P2 findings remain.

final result: passed

## Comparison Target

- Latest annotated profile-field source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-257665fa-c6a7-4614-a873-80daa51275d7.png` (840 x 802 px at 1x); implementation: `qa/profile-marker-only-final.png` (1265 x 720 px at the default desktop viewport); combined evidence: `qa/profile-marker-only-comparison.png` (2040 x 900 px).
- Latest profile-field state: authenticated Léa Martin profile using the Japan/EUR/individual/local-transfer scenario. The marked supplemental heading is absent, required registration/Schema fields retain `*`, and non-required dynamic fields have no `选填` or `Optional` suffix.
- Latest annotated sidebar-account source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-e709428a-48e0-4b07-a288-4146fc51e2ad.png` (1622 x 806); implementation: `qa/sidebar-platform-handle-final.jpg` (1265 x 712); combined full-view and focused evidence: `qa/sidebar-platform-handle-comparison.jpg` (2176 x 934).
- Latest sidebar-account responsive evidence: `qa/sidebar-platform-handle-mobile-final.jpg` (375 x 812 browser content at a 390 x 844 viewport override, device scale factor 1).
- Latest Invoice source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-e19fd72b-30d1-4a2d-80f6-88a93a2ccc9d.png` (766 x 741 at 1x); browser-rendered implementation: `qa/invoice-detail-desktop.png` (1425 x 990 at a 1440 x 1000 viewport override) and focused viewer crop `qa/invoice-viewer-focused.png` (759 x 778); combined focused evidence: `qa/invoice-viewer-comparison.png` (1832 x 942).
- Latest Invoice responsive evidence: `qa/invoice-detail-mobile-viewer.png` (375 x 812 browser content at a 390 x 844 viewport override, device scale factor 1). Measured client width, page scroll width, viewer width, and paper width were 375, 375, 351, and 329 px.
- Latest annotated upload-action source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-e8b3ec39-3da3-47f0-9b98-f464bb2b5b84.png` (1616 x 825); implementation: `qa/profile-upload-green-final.jpg` (1265 x 712); combined full-view and focused evidence: `qa/profile-upload-green-comparison.jpg` (2146 x 1168).
- Latest upload-action responsive evidence: `qa/profile-upload-green-mobile-final.jpg` (375 x 2202 full-page browser content at a 390 x 844 viewport override, device scale factor 1).
- Latest annotated profile source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-b8641d0a-42a6-4ce0-92fe-bb0456f72a2a.png` (1619 x 874); implementation states: `qa/profile-edit-clean-final.jpg`, `qa/profile-save-validating-final.jpg`, and `qa/profile-save-success-final.jpg` (1265 x 712 each); combined evidence: `qa/profile-save-flow-comparison.jpg` (4112 x 632).
- Latest responsive evidence: `qa/profile-edit-mobile-final.jpg` and `qa/profile-save-success-mobile-final.jpg` (375 x 812 browser content at a 390 x 844 viewport override, device scale factor 1).
- Latest annotated registration source: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-975f3ae6-6dc3-4218-b078-00ad40585a5c.png` (1920 x 861); implementation: `qa/register-field-labels-final.png` (1280 x 720); combined evidence: `qa/registration-bilingual-scope-comparison.png` (3224 x 900).
- Latest annotated payment sources: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-031c8367-f23a-4665-adf6-ad3c3418f5c9.png` (1910 x 871) and `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-e10c3539-c6a0-457d-bd5e-9622ff9410d3.png` (1917 x 865); implementation: `qa/payment-field-labels-final.png` and `qa/payment-dynamic-field-labels-final.png` (1280 x 720 each); combined evidence: `qa/payment-bilingual-scope-comparison.png` (6459 x 900).
- Registration source: `qa/source-register-layout.png` (1899 x 831); implementation: `qa/register-swapped-logo-palette.png` (1425 x 891); combined evidence: `qa/register-latest-comparison.png` (3348 x 900).
- Social source: `qa/source-social-verification.png` (1916 x 829); implementation: `qa/social-account-verification.png` (1280 x 720); combined evidence: `qa/social-verification-latest-comparison.png` (3220 x 900).
- Payment source: `qa/source-profile-payment.png` (1903 x 845); implementation: `qa/airwallex-schema-local.png` (1265 x 712) and `qa/profile-beneficiary-id.png` (1425 x 891); combined evidence: `qa/payment-profile-latest-comparison.png` (4641 x 900).
- Responsive evidence: `qa/register-mobile-final.png` and `qa/airwallex-schema-mobile.png`, both 390 x 844 at device scale factor 1.
- Density normalization: all captures are 1x. Comparison boards preserve aspect ratio and scale inputs to a shared height; the latest profile board uses 560 px image panels.
- State: authenticated Léa Martin profile with the sidebar account summary rendered as `YouTube · @LeaPlayFR`; profile editing with a light-green `上传认证截图` action; Airwallex Beneficiary created and persisted but its internal ID is not exposed.

## Full-View Comparison

The latest profile-field comparison places the annotated source beside the browser-rendered payment form. The implementation removes the complete boxed supplemental heading and description, lets the dynamic fields continue directly after the required Airwallex Schema fields, removes every visible `选填` / `Optional` suffix, and preserves `*` exclusively on required fields. Field order, values, two-column rhythm, control sizing, and the rest of the profile remain unchanged.

The latest sidebar-account comparison places the annotated source and updated profile together, followed by focused account-summary crops. The implementation preserves the creator name, avatar, sign-out affordance, spacing, truncation behavior, and sidebar height while prefixing the account ID with the current profile platform as `YouTube · @LeaPlayFR`.

The latest Invoice comparison uses the supplied viewer crop as the visual source of truth. The implementation retains the C-end page heading and processing sidebar outside the compared region, while the viewer itself reproduces the white toolbar, gray document stage, A4 paper, centered `INVOICE` heading, billing and creator details, black line-item table, payment information, and signature line. The document now draws creator and payout values from the current profile instead of hardcoded sample data.

The latest upload-action comparison combines the annotated source and implementation at the same profile-editing state, followed by focused button crops. The requested control keeps its existing size and placement, changes its copy to `上传认证截图`, and uses a restrained light-green background, green border, and green foreground while retaining the upload icon on the left.

The latest profile board puts the annotated source and all three implementation states in one comparison image. In editing state, the three highlighted status badges are absent, the screenshot action reads horizontally with the upload icon on the left, and the internal Beneficiary ID is absent. The saving flow introduces a centered blocking validation dialog, followed by a success dialog; after saving, the three status badges return in the underlying read-only profile.

The latest annotated registration and payment boards were opened together with the corresponding final captures. The annotations define the bilingual scope: only the outlined input/select labels and the outlined payout-account heading remain Chinese/English. Page headings, supporting copy, helper text, agreements, buttons, status copy, and the social-verification screen remain Chinese. Registration keeps the creator image on the left and the form on the right. Payment onboarding retains the channel selector and dynamic Airwallex Schema area.

No actionable P0/P1/P2 mismatch remains.

## Focused Evidence

- `qa/sidebar-platform-handle-comparison.jpg`: the focused source and implementation regions clearly show the platform prefix added before the creator handle without changing the surrounding sidebar anatomy.
- `qa/sidebar-platform-handle-mobile-final.jpg`: the same `YouTube · @LeaPlayFR` summary is visible in the mobile navigation drawer without clipping or overlap.
- `qa/invoice-viewer-comparison.png`: toolbar anatomy, paper proportions, section ordering, black table treatment, serif document typography, totals, payment block, and signature area are directly readable side by side.
- `qa/invoice-detail-mobile-viewer.png`: the complete formal Invoice remains inside the 375 px client width without overlap or horizontal overflow; the status panel remains available above the viewer.
- `qa/profile-upload-green-comparison.jpg`: the focused source and implementation regions clearly show the copy change, light-green treatment, unchanged 8 px radius, and left-icon/right-text order.
- `qa/profile-upload-green-mobile-final.jpg`: the 136 px upload action remains inside the 375 px mobile client width with no horizontal overflow.
- `qa/profile-edit-clean-final.jpg`: the annotated hero, social-account, payout-header, and screenshot-button regions are readable in one viewport; no extra focused crop was required.
- `qa/profile-save-validating-final.jpg`: blocking `校验中` state and disabled underlying save controls.
- `qa/profile-save-success-final.jpg`: explicit `保存成功` acknowledgement with restored `账号已认证`、`已认证` and `校验通过` badges behind the overlay.
- `qa/profile-edit-mobile-final.jpg` and `qa/profile-save-success-mobile-final.jpg`: edit layout and success dialog remain within the mobile content width.
- `qa/register-field-labels-final.png`: email, password, and invitation-code labels are bilingual; all surrounding registration copy is Chinese.
- `qa/payment-field-labels-final.png`: the four required general-payment labels and payout-account heading are bilingual; section title, channel descriptions, Schema description, and status copy are Chinese.
- `qa/payment-dynamic-field-labels-final.png`: payment-scenario and generated bank-field labels are bilingual; source note, agreement, CTA, and side-panel copy are Chinese.
- `qa/register-mobile-final.png`: form hierarchy remains complete at 390 x 844; image panel is hidden and document width equals viewport width.
- `qa/airwallex-schema-mobile.png`: channel cards and scenario controls stack vertically with no horizontal overflow.
- `qa/profile-beneficiary-id.png`: historical LOCAL-transfer evidence showing ABA Routing Number and account type instead of an empty SWIFT field. The current profile intentionally no longer exposes `beneficiary_id`.

## Required Fidelity Surfaces

- Fonts and typography: system Inter-compatible stack and Chinese fallbacks preserve the source's compact operational hierarchy. Weights, wrapping, line height, and zero negative letter spacing remain consistent.
- Spacing and layout rhythm: two-column desktop shells, compact 8 px-or-smaller radii, form grouping, and mobile single-column flow match the existing COMETS console language.
- Colors and tokens: neutral surfaces, dark ink, COMETS pink CTA, light-purple secondary actions, and green verification states have sufficient visual distinction. The Invoice viewer uses the source's white toolbar, cool-gray canvas, black table header, and purple document actions.
- Image quality and assets: the supplied creator image and COMETS mark are crisp, correctly cropped, and not replaced by generated or CSS-drawn approximations.
- Copy and content: bilingual copy is restricted to the annotated input/select labels and payout-account heading. All non-field registration, social-verification, agreement, action, helper, and status text is Chinese.
- Accessibility and interactions: labeled inputs, semantic buttons, an ARIA modal dialog, disabled controls during validation, disabled unavailable channels, disabled continue-before-verification state, focus styles, and mobile tap targets were checked.

## Comparison History

### Iteration 5: Latest Registration And Account Verification

- [P1] Registration information and creator imagery were on the wrong sides for the latest request.
  Fix: set the story pane to the left and form pane to the right while preserving the mobile form-only layout.
  Post-fix evidence: `qa/register-latest-comparison.png` and `qa/register-mobile-final.png`.

- [P1] Social onboarding still exposed platform and handle inputs and did not gate continuation on ownership verification.
  Fix: remove both controls, require links plus screenshots, reset verification after evidence changes, and enable continuation only after verification succeeds.
  Post-fix evidence: `qa/social-verification-latest-comparison.png`.

### Iteration 6: Dynamic Payment Profile

- [P1] The payment form was fixed to an Airwallex account shape and did not cover every universal payment field.
  Fix: collect legal name/entity name, detailed current address, beneficiary phone, and email; add channel selection and Schema-driven fields.
  Post-fix evidence: `qa/payment-profile-latest-comparison.png`.

- [P1] Beneficiary creation and returned ID were not represented as a complete profile workflow.
  Fix: validate values against the generated schema, create the mock Airwallex Beneficiary, persist `beneficiary_id`, and verify it after a page reload.
  Post-fix evidence: `qa/profile-beneficiary-id.png`; stored ID `bene_us45678861`.

- [P2] A LOCAL transfer profile displayed an irrelevant empty SWIFT field.
  Fix: render ABA, JP routing, IBAN, account type, or SWIFT fields according to the saved Schema values.
  Post-fix evidence: `qa/profile-beneficiary-id.png`.

### Iteration 7: Bilingual Field Scope

- [P2] Bilingual copy had spread from field labels into page headings, descriptions, helper text, agreements, buttons, status messages, and the social-verification step.
  Fix: retain Chinese/English only on login email/password labels, registration email/password/invitation-code labels, the four required payment labels, payout-account heading, payment-scenario labels/options, and Airwallex-generated bank-field labels/options. Restore every other affected string to Chinese.
  Post-fix evidence: `qa/registration-bilingual-scope-comparison.png` and `qa/payment-bilingual-scope-comparison.png`.

### Iteration 8: Profile Editing And Save Feedback

- [P2] Editing exposed redundant verification badges and an internal Airwallex Beneficiary ID.
  Fix: hide the three status badges while editing, remove the Beneficiary ID field from the rendered profile, and restore the badges after saving.
  Post-fix evidence: `qa/profile-edit-clean-final.jpg` and `qa/profile-save-success-final.jpg`.

- [P2] The screenshot replacement action stacked its icon and copy vertically.
  Fix: override the form-label grid rule with a profile-specific inline-flex layout so the upload icon stays left of the text.
  Post-fix evidence: `qa/profile-edit-clean-final.jpg`.

- [P2] Profile saving only used an easy-to-miss inline notice.
  Fix: add a blocking `校验中` dialog, prevent repeat submission, then show an explicit `保存成功` acknowledgement.
  Post-fix evidence: `qa/profile-save-validating-final.jpg`, `qa/profile-save-success-final.jpg`, and `qa/profile-save-success-mobile-final.jpg`.

### Iteration 9: Certification Screenshot Upload Action

- [P2] The screenshot action still read `更换认证截图` and used the generic white secondary-button treatment.
  Fix: rename the action to `上传认证截图` and apply a profile-scoped light-green background, border, foreground, and hover state without changing its layout.
  Post-fix evidence: `qa/profile-upload-green-comparison.jpg` and `qa/profile-upload-green-mobile-final.jpg`.

### Iteration 10: Nebula Quest Contract Reader

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-748beeb1-5319-4ac9-8f59-f8f40c99c8ef.png` (809 x 792 at 1x).
- Browser-rendered implementation: `qa/contract-detail-desktop-final.png` (1611 x 805 at the default desktop viewport) and `qa/contract-detail-mobile-final.png` (375 x 812 capture with a 390 x 844 viewport override).
- Combined full-view evidence: `qa/contract-detail-comparison.png` (2748 x 954). Both inputs were scaled proportionally to a shared 900 px comparison height.
- State: authenticated as Léa Martin, contract detail route `/contracts/CON-NQ-FR-2607-001`, page 1 of a 16-page PDF.

- [P1] The old contract detail was an HTML summary rather than the supplied embedded PDF reader.
  Fix: replace it with a real 16-page PDF, a compact “合同全文” header, file/page metadata, the browser PDF toolbar, and open-in-new-window/download access.
  Post-fix evidence: `qa/contract-detail-comparison.png`.

- [P1] The creator and contract data still represented Mina Kato and four unrelated contracts.
  Fix: set the active creator to Léa Martin, retain only the Nebula Quest France KOL promotion services agreement, and synchronize the related request-project link.
  Post-fix evidence: `qa/contract-detail-desktop-final.png`; the browser contract-list snapshot showed exactly one contract.

- [P2] The embedded Chrome PDF surface rendered as an empty dark region at the mobile breakpoint.
  Fix: render the actual PDF first page as the mobile preview and keep explicit open/download actions below it.
  Post-fix evidence: `qa/contract-detail-mobile-final.png`; measured `scrollWidth` did not exceed `clientWidth`.

Focused evidence was required because PDF toolbar controls and first-page typography were too small in the full app capture. The source and implementation both show the white reader header, filename plus 16-page count, purple open-in-new-window action, dark native toolbar, centered document page, and vertical reader scroll. The implementation intentionally adds the surrounding creator portal and contract heading because the source image is a crop of the reader component.

Required fidelity surfaces:
- Fonts and typography: the portal retains its compact Inter-compatible UI hierarchy; the real PDF uses Helvetica-compatible document typography with clear title, terms and footer hierarchy.
- Spacing and layout rhythm: the reader uses an 8 px radius, compact 68 px header and full-width embedded document region; mobile stacks the header, preview and actions without overflow.
- Colors and visual tokens: neutral COMETS surfaces, purple contract accents and the native dark PDF toolbar align with the supplied reference.
- Image quality and assets: the embedded document is a real vector PDF; the mobile fallback is rendered directly from page 1 rather than a placeholder or CSS recreation.
- Copy and content: creator, contract name, file name, contract number, EUR amount, dates and 16-page count are internally consistent.

### Iteration 11: Formal Invoice Viewer

- [P1] The previous Invoice detail used a generic modern summary document and did not match the supplied formal invoice.
  Fix: rebuild the document into the reference hierarchy with a centered title, COMETS billing entity, two-column creator and invoice metadata, black line-item table, total, bank-payment details, and signature area.
  Post-fix evidence: `qa/invoice-viewer-comparison.png`.

- [P2] Invoice recipient and creator data were hardcoded and inconsistent with the active Léa Martin profile.
  Fix: source legal name, address, phone, email, bank account, bank name, SWIFT/IBAN, date, currency, project, and amount from the shared profile and Invoice data.
  Post-fix evidence: `qa/invoice-detail-desktop.png`.

- [P2] The prior document did not use the management-console viewer shell or provide a mobile-safe formal preview.
  Fix: add the compact `Invoice全文` toolbar, PDF metadata, purple print-to-PDF action, scrollable gray document stage, print stylesheet, and responsive paper rules down to the 375 px client width.
  Post-fix evidence: `qa/invoice-detail-desktop.png` and `qa/invoice-detail-mobile-viewer.png`.

### Iteration 12: Sidebar Platform Prefix

- [P2] The left-bottom account summary displayed only `@LeaPlayFR`, so users could not identify which social platform the account ID belonged to.
  Fix: render the value dynamically as `profile.social.platform · profile.social.handle`, preserving the existing single-line ellipsis behavior.
  Post-fix evidence: `qa/sidebar-platform-handle-comparison.jpg` and `qa/sidebar-platform-handle-mobile-final.jpg`.

### Iteration 13: Creator Contract List And Status Board

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-9db69ff3-4601-4a0c-b3b8-742f81ba8709.png` (1634 x 762 px).
- Implementation evidence: `qa/contract-list-desktop-final.png` (1634 x 900 px at a 1634 x 900 CSS viewport), `qa/contract-list-mobile-final.png` (375 x 875 px at a 390 x 844 browser viewport with a 375 px layout viewport), `qa/contract-detail-desktop-final.png` (1634 x 900 px), and `qa/contract-detail-mobile-final.png` (375 x 844 px).
- Density normalization: source and desktop implementation were captured at 1x. The source and implementation were aligned by width in `qa/contract-list-comparison.png`; the different heights are retained because the creator version has fewer rows and no upload action.
- State: authenticated as Léa Martin; contract list shows the single linked Nebula Quest contract in `履约中`; detail shows page 1 of the supplied 16-page PDF.
- Full-view comparison: `qa/contract-list-comparison.png` places the management reference and browser-rendered creator implementation in one image. The creator view retains the reference's three summary bands, compact search and status filters, dense table, pale operational background, and restrained borders while intentionally omitting upload and management-only columns/actions.
- Focused evidence: `qa/contract-detail-desktop-final.png` verifies the status summary, lifecycle, file metadata, and native PDF viewer; `qa/contract-detail-mobile-final.png` verifies the vertical status board at 375 px. No additional crop was required because the status labels and contract metadata remain readable in the viewport captures.

- [P1] The previous creator contract page used a single oversized card and did not match the management contract-list pattern.
  Fix: replace it with summary metrics, search, status tabs, a dense desktop table, and a dedicated mobile list while keeping the creator-only scope.
  Post-fix evidence: `qa/contract-list-comparison.png` and `qa/contract-list-mobile-final.png`.

- [P1] The contract detail previously lacked an explicit lifecycle and did not use the supplied contract artifact.
  Fix: add the `待签署 → 已生效 → 履约中 → 待请款 → 已归档` status board and load `/26-kol-standard-terms-template.pdf` as the 16-page contract source, with a rendered page-one fallback on mobile.
  Post-fix evidence: `qa/contract-detail-desktop-final.png` and `qa/contract-detail-mobile-final.png`.

- Required fidelity surfaces:
  - Fonts and typography: the existing COMETS sans-serif stack, compact table hierarchy, weights, line heights, zero letter spacing, and mobile wrapping are retained; the longer French contract title wraps without clipping.
  - Spacing and layout rhythm: desktop summary cards, toolbar, and table follow the reference's compact operational rhythm; mobile transforms to a 349 px-wide stacked list and vertical lifecycle with no horizontal overflow.
  - Colors and visual tokens: neutral surfaces and the reference's peach, mint, and pale-yellow summary tones are preserved; purple is reserved for the creator-facing contract state and document affordances.
  - Image quality and asset fidelity: the desktop viewer loads the supplied vector PDF and mobile renders a page-one PNG generated directly from that PDF, without placeholder artwork.
  - Copy and content: the list and detail consistently show Léa Martin, Nebula Quest, `EUR 8,500`, `CON-260724-KOL-01`, `IO-260724-NQ-FR`, 16 pages, and the current `履约中` status.

### Iteration 14: Unsigned Invoice And Handwritten Signature

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-39d3a401-79a5-4b32-a677-91e3f66bc116.png` (1634 x 804 px at 1x).
- Browser-rendered implementation: `qa/invoice-unsigned-list.png` (1634 x 804 px at a 1634 x 804 CSS viewport), `qa/invoice-signature-modal.png` (1265 x 712 px), `qa/invoice-signature-upload.png` (1265 x 712 px), `qa/invoice-signed-detail.png` (1265 x 1280 px full page), and `qa/invoice-signature-mobile.png` (375 x 812 px at a 390 x 844 browser viewport override).
- Combined full-view evidence: `qa/invoice-reference-comparison.png` (1634 x 402 px). The source and implementation were both normalized to 817 x 402 and placed side by side.
- State: authenticated as Léa Martin; the `待签署` tab shows two remaining records after signing `INV-260727-S`; the tested Invoice advances to `待审核`.
- Full-view comparison: the implementation retains the reference's compact left navigation, pale page canvas, horizontal status tabs, white content surface, restrained status counts, and operational density. It intentionally replaces the source's empty state with actionable Invoice rows containing explicit `查看` and `下载` paths.
- Focused evidence: `qa/invoice-signature-modal.png` and `qa/invoice-signature-upload.png` make the two signing methods, helper copy, validation state, and confirmation action readable. `qa/invoice-signed-detail.png` shows the handwritten image directly below `Signature:` and the synchronized review timeline. `qa/invoice-signature-mobile.png` verifies the complete upload modal at the responsive breakpoint.

- [P1] The supplied `待签署` tab had no records or signing path.
  Fix: add stable unsigned Invoice records, merge them into persisted mock data, expose separate view/download actions, and provide the detail-page signing entry.
  Post-fix evidence: `qa/invoice-reference-comparison.png` and `qa/invoice-unsigned-detail.png`.

- [P1] Invoice signing previously used a generic confirmation without capturing a real handwritten signature.
  Fix: add pointer-enabled drawing and PNG/JPG upload modes, normalize the captured image, persist signer metadata, render the signature under `Signature:`, and transition the Invoice to `PENDING_REVIEW`.
  Post-fix evidence: `qa/invoice-signature-modal.png`, `qa/invoice-signature-upload.png`, and `qa/invoice-signed-detail.png`.

- [P2] A signed demo could consume the only unsigned record and leave the requested tab empty.
  Fix: keep an independent unsigned demonstration record while using a separate Invoice for end-to-end signing verification.
  Post-fix evidence: `qa/invoice-unsigned-list.png`; the tab contains two unsigned records after QA.

- Required fidelity surfaces:
  - Fonts and typography: compact system sans-serif UI typography matches the source; the formal Invoice retains its serif document styling and clear `Signature:` hierarchy.
  - Spacing and layout rhythm: source-aligned sidebar, status tabs, white list surface, compact row actions, 8 px radii, and modal spacing remain consistent at desktop and mobile widths.
  - Colors and visual tokens: neutral COMETS surfaces, peach active navigation, pale-yellow unsigned status, dark primary action, and restrained lavender signature tabs provide clear semantic distinction without changing the established palette.
  - Image quality and asset fidelity: handwritten signatures are captured as normalized PNG data and rendered with `object-fit: contain`; supplied brand assets and library icons remain crisp.
  - Copy and content: `待签署`, `查看`, `下载`, both signature methods, the signature confirmation consequence, success notice, and timeline states are explicit and internally consistent.

### Iteration 15: Bilingual Editable Profile Fields

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-5a084e6c-9888-4c36-a924-a4354976fa60.png` (1634 x 800 px) and `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-a6b69902-ba47-42db-b930-103d21b65c26.png` (1634 x 800 px).
- Implementation evidence: `qa/profile-bilingual-desktop-view.png` (1585 x 1250 px), `qa/profile-bilingual-mobile-top.png` (375 x 812 px), and `qa/profile-bilingual-mobile-payout.png` (375 x 812 px).
- Viewports and normalization: desktop used the browser's 1585 px content viewport; mobile used a 390 x 844 browser viewport with a measured 375 px layout width. Captures used device scale factor 1. `qa/profile-bilingual-comparison.png` scales the 1634 px source and 1585 px implementation to equal 780 px comparison columns and aligns their top edges.
- State: authenticated as Léa Martin. The full-view source and implementation are both in profile view mode; focused mobile evidence uses profile edit mode. The LOCAL/EUR/France payout scenario displays the generated IBAN field.
- Full-view comparison: `qa/profile-bilingual-comparison.png` places the supplied profile reference and updated local implementation in one image. The implementation preserves the reference layout, values, channel states, colors, and controls while adding English only to field labels.
- Focused evidence: the desktop view capture keeps every basic-information and Airwallex label readable; the two mobile edit captures verify basic-information and payout regions separately because the full page is too tall for field text to remain legible in a single comparison.

- [P2] Editable profile fields previously displayed Chinese-only labels and did not match the bilingual registration fields.
  Fix: reuse the registration and Airwallex Form Schema wording for legal name, contact, address, country, recipient type, account currency, transfer method, account name, bank name, bank number, IBAN, SWIFT, ABA, bank and branch codes, account type, and bank address; add `Display name` for the profile-only field.
  Post-fix evidence: `qa/profile-bilingual-comparison.png`, `qa/profile-bilingual-mobile-top.png`, and `qa/profile-bilingual-mobile-payout.png`.

- Required fidelity surfaces:
  - Fonts and typography: existing COMETS typography, weights, zero letter spacing, and label hierarchy are unchanged; long bilingual labels wrap without clipping.
  - Spacing and layout rhythm: desktop retains the two-column form and mobile retains the single-column stack with no overlap or horizontal overflow.
  - Colors and visual tokens: field controls, cards, status colors, and the light-green screenshot-upload action remain unchanged.
  - Image quality and asset fidelity: supplied COMETS assets and library icons remain unchanged and crisp; this text-only update introduces no replacement imagery.
  - Copy and content: English labels match registration and the generated Airwallex Schema exactly; non-field headings, descriptions, badges, and buttons remain Chinese-only.

### Iteration 16: Registration Basic Information And Country Label

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-5cfd9f15-2b19-4051-93a4-797f280fa1fc.png` (695 x 345 px) for the basic-information fields and `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-069aaf8a-4815-4cc5-9336-9222b44e2461.png` (1622 x 818 px) for the COMETS onboarding page and annotated copy changes.
- Implementation evidence: `qa/onboarding-basic-info-desktop.png` (1619 x 892 px), `qa/onboarding-basic-info-focused.png` (710 x 315 px), and `qa/onboarding-basic-info-mobile.png` (375 x 812 px).
- Viewports and normalization: desktop used a 1634 x 900 browser viewport with a measured 1619 px content width; mobile used a 390 x 844 browser viewport with a measured 375 px content width. Captures used device scale factor 1. Both comparison images scale their source and implementation captures to equal 780 px columns and align the top edges.
- State: registration step 3 with Airwallex selected, Form Schema synchronized, and the Japan/EUR/individual/local-transfer scenario active.
- Full-view comparison: `qa/onboarding-basic-info-full-comparison.png` places the annotated COMETS onboarding reference beside the rendered local page. The implementation preserves the page shell, progress, card hierarchy, channel states, and Schema controls while applying the requested copy changes.
- Focused evidence: `qa/onboarding-basic-info-focused-comparison.png` places the four-field reference beside the rendered basic-information section, clearly verifying the field order, half-width email, full-width address textarea, and bilingual labels.

- [P1] Registration basic information used payment-oriented legal and beneficiary labels instead of the four contact fields in the supplied form reference.
  Fix: render `真实姓名 / Real Name`, `联系电话 / Tel`, `联系邮箱 / Email`, and `联系地址 / Address` in the requested order, with the address as a 68 px full-width textarea; mirror the labels in the saved profile without changing the underlying data or persistence flow.
  Post-fix evidence: `qa/onboarding-basic-info-focused-comparison.png` and `qa/onboarding-basic-info-mobile.png`.

- [P2] The section heading included `· 支付通用必收`, and the payout condition used `收款国家 / 地区 / Recipient country or region`.
  Fix: shorten the heading to `基本信息` and rename the condition and profile label to `国家 / Country`.
  Post-fix evidence: `qa/onboarding-basic-info-full-comparison.png`.

- Required fidelity surfaces:
  - Fonts and typography: the existing compact COMETS sans-serif hierarchy is preserved; short bilingual labels remain on one line at desktop and mobile widths.
  - Spacing and layout rhythm: desktop matches the two-column first row, half-width email, and full-width address structure; mobile converts the same fields to a clean single-column stack.
  - Colors and visual tokens: existing neutral form cards, coral progress accents, lavender Airwallex panel, and field borders remain unchanged.
  - Image quality and asset fidelity: the supplied COMETS logo asset and library icons remain crisp and unchanged; no new image assets were required.
  - Copy and content: field labels match the supplied reference exactly, the heading has no suffix, and `国家 / Country` is consistent between onboarding and profile.

### Iteration 17: Enlarged Invoice Reader

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-ad33cc85-a74c-4d83-aa03-b5282267d52a.png` (1608 x 798 px at 1x).
- Browser-rendered implementation: `qa/invoice-zoom-entry-1608.png` (1593 x 791 px captured from a 1608 x 798 CSS viewport), `qa/invoice-zoom-expanded-1608.png` (1608 x 798 px), and `qa/invoice-zoom-mobile.png` (390 x 844 px at a 390 x 844 viewport override).
- Combined full-view evidence: `qa/invoice-zoom-comparison.png` (1608 x 399 px). The source and implementation were normalized to 804 x 399 and placed side by side.
- State: authenticated as Léa Martin on `INV-260727-DEMO`; the source-aligned detail view exposes `放大查看` beside `下载PDF`, and the expanded state fills the browser viewport.
- Full-view comparison: the implementation preserves the supplied COMETS header, sidebar, detail heading, white viewer toolbar, gray document canvas, formal Invoice paper, and right-side processing panel. The new action sits in the existing toolbar action cluster and uses the same restrained purple visual language.
- Focused evidence: `qa/invoice-zoom-expanded-1608.png` clearly shows the full-screen toolbar, enlarged 878 px document paper, retained download action, centered paper, and scrollable document canvas. `qa/invoice-zoom-mobile.png` clearly shows the icon-only expanded/exit and download actions above a 370 px paper with no horizontal overflow.

- [P1] The Invoice viewer did not provide a path to inspect the document at a larger size.
  Fix: add a `放大查看` toolbar action that opens a fixed full-screen reader and proportionally enlarges the complete Invoice document.
  Post-fix evidence: `qa/invoice-zoom-comparison.png` and `qa/invoice-zoom-expanded-1608.png`.

- [P2] A full-screen document state could trap users or leave the background page scrolling.
  Fix: change the same toolbar action to `退出放大`, support the Escape key, lock background body scrolling while expanded, and restore the previous overflow state on exit.
  Post-fix evidence: browser interaction verified `is-expanded: true` with `bodyOverflow: hidden`, followed by `is-expanded: false` and cleared overflow after Escape.

- Required fidelity surfaces:
  - Fonts and typography: the existing compact COMETS toolbar hierarchy and formal serif Invoice typography remain unchanged; the expanded paper scales as one unit so weights and line spacing stay proportional.
  - Spacing and layout rhythm: the new action aligns with `下载PDF`, uses a 34 px control height and 6 px radius, and the expanded viewer uses a fixed toolbar plus centered scrollable paper.
  - Colors and visual tokens: the pale lavender action, purple icon/text, neutral gray stage, and white paper reuse the existing Invoice viewer tokens without introducing a new palette.
  - Image quality and asset fidelity: the Invoice remains live HTML at native browser resolution; Lucide maximize/minimize icons match the existing toolbar icon family and stay sharp at both breakpoints.
  - Copy and content: `放大查看` changes to `退出放大` in the active state, while `下载PDF`, Invoice metadata, signing state, and document content remain intact.

### Iteration 18: Contract Obligations Panel

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-0fd35f96-2701-4e17-987d-6a0aac7f4c95.png` (1613 x 733 px at 1x).
- Implementation evidence: `qa/contract-obligations-desktop-source-size.png` (1600 x 758 px at a 1615 x 765 browser viewport), `qa/contract-obligations-desktop.png` (1265 px desktop layout viewport), and `qa/contract-obligations-mobile-focus.png` (375 x 812 px at a 390 x 844 browser viewport).
- Density normalization: source and implementation are 1x captures. `qa/contract-obligations-comparison.png` aligns the reference and implementation by height in a single 3237 x 900 px comparison image; the 13 px desktop width difference is browser scrollbar/chrome normalization and does not alter the content grid.
- State: authenticated as Léa Martin; contract status is `履约中`; six extracted creator obligations are present, with the first items visible in the desktop scroll region and the full list available by scrolling.
- Full-view comparison: `qa/contract-obligations-comparison.png` shows the original single-column contract status/PDF layout next to the revised management-style two-column status-and-obligations board. Existing title, metadata, status treatments, viewer shell, sidebar, spacing, and COMETS palette remain consistent.
- Focused evidence: `qa/contract-obligations-desktop.png` verifies the compact desktop two-column anatomy and internal obligations scroll; `qa/contract-obligations-mobile-focus.png` verifies readable labels, clause citations, timing, and full-width stacking without horizontal overflow.

- [P1] The previous detail page exposed contract status but gave the creator no actionable interpretation of the 16-page agreement.
  Fix: extract six creator-facing duties covering delivery, pre-publication approval, content retention, compliance and IP, confidentiality and responsiveness, and Invoice/beneficiary requirements. Each item includes the source clause and timing.
  Post-fix evidence: `qa/contract-obligations-desktop.png` and `qa/contract-obligations-mobile-focus.png`.

- [P2] The first desktop implementation stretched the status board to the full height of the long obligation list, leaving excessive empty space.
  Fix: constrain the desktop obligation list to a 315 px scroll region while keeping the mobile list expanded.
  Post-fix evidence: `qa/contract-obligations-desktop.png`.

- Required fidelity surfaces:
  - Fonts and typography: the existing COMETS sans-serif stack and hierarchy are preserved; obligation titles, summaries, citations, and timing use progressively smaller optical levels with zero letter spacing and no clipped desktop/mobile text.
  - Spacing and layout rhythm: the desktop grid uses a 380 px obligations rail, 14 px inter-column gap, matching 8 px card radii, and a compact 389 px board height; mobile stacks cards at 351 px with no horizontal overflow.
  - Colors and visual tokens: neutral operational surfaces remain dominant; purple identifies active fulfillment duties and blue identifies the later pre-claim requirement.
  - Image quality and asset fidelity: no new raster assets were required; the supplied vector contract PDF and rendered mobile fallback remain unchanged and sharp.
  - Copy and content: obligation copy is grounded in the supplied PDF's IO and Standard Terms, with visible references such as `IO 第2条`, `标准条款第7.1-7.2条`, and `标准条款第3.2-3.6条`.

### Iteration 19: Creator Invoice Table

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-5d83cbe4-1b20-40bc-bec9-e3f270106b39.png` (1246 x 486 px at 1x).
- Implementation evidence: `qa/invoice-table-desktop-final.png` (1155 x 904 px) and `qa/invoice-table-mobile.png` (375 x 812 px).
- State: authenticated as Léa Martin on `/invoices`; seven Invoice records are visible and every payment channel is normalized to `Airwallex`.
- Full-view comparison: `qa/invoice-table-comparison.png` places the supplied reference beside the desktop implementation. `qa/invoice-table-header-comparison.png` provides a focused comparison of the header and first rows.
- Table anatomy: the desktop table uses the requested order `Invoice`, `关联项目`, `渠道`, `金额`, `状态`, `操作`. Invoice ID and issue date stay grouped, the related project has its own column, and view/download remain available as icon actions with tooltips.
- Responsive behavior: below 1100 px each record becomes a compact two-row grid; below 560 px it becomes a three-row mobile record while keeping amount, Airwallex channel, status, and both actions visible.

- [P2] The first desktop grid allowed the operation controls to extend beyond the right edge of the list surface.
  Fix: rebalance the six grid tracks and reserve a stable action column so both controls remain inside the card without horizontal scrolling.
  Post-fix evidence: `qa/invoice-table-desktop-final.png`; browser measurements reported `clientWidth: 1155` and `scrollWidth: 1155`.

- Required fidelity surfaces:
  - Fonts and typography: compact COMETS sans-serif table typography, medium-weight headers, and zero letter spacing remain consistent with the supplied operational list.
  - Spacing and layout rhythm: the pale-gray header band, dense rows, stable six-column alignment, and compact icon actions match the source hierarchy without adding decorative cards.
  - Colors and visual tokens: neutral white/gray surfaces, existing semantic status colors, and restrained icon controls preserve the management-console visual language.
  - Image quality and asset fidelity: no raster assets were added; existing Lucide view/download icons remain crisp and expose accessible tooltips.
  - Copy and content: all six requested headers are present in the exact order, every channel reads `Airwallex`, and Invoice/project metadata remain scannable without duplicating columns.

### Iteration 20: Required-Field Marker Convention

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-257665fa-c6a7-4614-a873-80daa51275d7.png` (840 x 802 px at 1x).
- Browser-rendered implementation: `qa/profile-marker-only-final.png` (1265 x 720 px at the default desktop viewport).
- Combined full-view and focused evidence: `qa/profile-marker-only-comparison.png` (2040 x 900 px). Both images retain their aspect ratio and are aligned to a shared 900 px comparison height.
- State: authenticated personal Airwallex profile with Japan/EUR/local-transfer fields and dynamic non-required payment fields.

- [P2] The profile inserted a redundant “补充付款信息” heading and repeated `选填 / Optional` on every non-required field.
  Fix: remove the heading, explanatory copy and icon; remove optional-state suffixes from profile fields and the registration invitation code; retain `*` only on required fields.
  Post-fix evidence: `qa/profile-marker-only-comparison.png`.

- Required fidelity surfaces:
  - Fonts and typography: existing bilingual label typography, weights and line heights are preserved; removing the suffix shortens labels without changing their hierarchy.
  - Spacing and layout rhythm: dynamic fields now follow the required Schema fields with the same 12 px grid gap, and no empty heading band or divider remains.
  - Colors and visual tokens: field surfaces, borders, disabled states and semantic status colors are unchanged.
  - Image quality and asset fidelity: no image or icon assets were added or replaced; the removed information icon was part of the deleted heading.
  - Copy and content: required fields retain `*`; non-required fields and the invitation code carry no `选填`, `Optional`, or equivalent suffix.

### Iteration 21: Supplied Invoice PDF And Error Feedback

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-1001e64e-5893-4dbd-b74f-4b7000c58f9f.png` (1631 x 778 px at 1x) and `/Users/aria/Downloads/INV-20260723-001-Alex-Ruiz.pdf` (one 612 x 792 pt Letter page).
- Browser-rendered implementation: `qa/invoice-pdf-feedback-source-size.png` (1631 x 778 px), `qa/invoice-feedback-modal.png` (1265 x 712 px), and `qa/invoice-pdf-feedback-mobile-top.png` (375 x 812 px at a 390 x 844 viewport override).
- Full-view comparison: `qa/invoice-pdf-feedback-comparison.png` places the 1631 x 778 reference and implementation side by side without density scaling. Both show the same COMETS shell, detail hierarchy, document viewer, and processing card.
- Focused evidence: `qa/invoice-feedback-modal.png` verifies the full issue-type/details submission path and visibly shows the persisted handwritten signature directly below the supplied PDF's `Signature:` label.
- State: authenticated as Léa Martin on `INV-260727-S`. The supplied PDF is the shared viewer/download source; the Invoice is already signed and pending review. The feedback form was submitted as `付款信息有误` and produced the success notice `Invoice 问题已反馈：付款信息有误`.
- PDF verification: `pdfinfo` confirmed one unencrypted Letter page with no form fields or JavaScript. The rendered page asset is 1224 x 1584 px and preserves the source's project, amount, beneficiary details, and signature area.

- [P1] The previous detail page dynamically reconstructed Invoice content from each mock record instead of displaying the user-supplied formal Invoice.
  Fix: replace the generated HTML document with a high-resolution rendering of `INV-20260723-001-Alex-Ruiz.pdf`, use the original PDF for every download action, and position saved signatures over its own signature area.
  Post-fix evidence: `qa/invoice-pdf-feedback-source-size.png` and `qa/invoice-feedback-modal.png`.

- [P1] The reference reserved a prominent area for verification guidance, but the page did not clearly ask creators to validate payment project and payout details before signing.
  Fix: add a full-width pale-yellow verification notice between the heading and document layout with the requested project/payment-information copy.
  Post-fix evidence: `qa/invoice-pdf-feedback-comparison.png` and `qa/invoice-pdf-feedback-mobile-top.png`.

- [P1] Creators had no direct route to report incorrect Invoice information from the processing card.
  Fix: add an always-available `Invoice 信息有误` action and a functional modal with issue type, required details, disabled empty-submit state, cancel/close actions, and explicit submission success feedback.
  Post-fix evidence: `qa/invoice-feedback-modal.png`; browser interaction confirmed the submission success state.

- Required fidelity surfaces:
  - Fonts and typography: the COMETS interface typography remains unchanged while the PDF's native sans-serif hierarchy is preserved as a high-resolution source rendering.
  - Spacing and layout rhythm: the requested notice occupies the annotated full-width band; the right-card issue action aligns with the existing review and download controls using 8 px-or-smaller radii.
  - Colors and visual tokens: the notice reuses the existing amber review treatment and the issue action uses a restrained coral error treatment without changing the neutral operational palette.
  - Image quality and asset fidelity: the one-page source PDF was rendered at 2x page dimensions, remains sharp in normal and enlarged readers, and is downloaded unchanged from the supplied file.
  - Copy and content: the reminder explicitly names payment project and payout information; the modal offers project, payout, amount/currency, and other issue categories; all document content comes from the supplied Invoice.

## Verification

- Primary interactions: contract search, empty filtered state, status-tab switching, list-to-detail navigation, five-stage contract lifecycle visibility, extracted-obligation scrolling, clause and timing visibility, embedded 16-page PDF loading, mobile obligation stacking, mobile PDF fallback and actions, sidebar account rendering in desktop and mobile navigation, six-column Invoice table rendering, Airwallex channel normalization, supplied Invoice PDF rendering/download source, pre-signing verification reminder, Invoice issue-modal validation/submission, unsigned Invoice filtering, explicit view/download actions, expanded Invoice entry and exit, Escape-key exit, background scroll locking, drawn-signature submission, upload-signature mode, signature persistence, review-status transition, profile edit entry, bilingual label rendering, onboarding field rendering, English-only account-name filtering, validation state, success acknowledgement, authenticated routing, registration, ownership verification, and payment scenario controls.
- Browser console: zero warnings and zero errors in the latest contract obligations desktop/mobile, Invoice table desktop/mobile, Invoice normal, expanded, Escape-exit, profile, registration, and account-name input checks.
- Responsive: the Invoice PDF detail desktop check measured `clientWidth: 1616` and `scrollWidth: 1616`; its mobile check measured `clientWidth: 375`, `scrollWidth: 375`, and a 351 px verification notice. The Invoice table desktop check measured `clientWidth: 1155` and `scrollWidth: 1155`; its mobile check measured a 375 px content width with no horizontal overflow.
- Automated: TypeScript passed; Vitest 26/26 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

## Findings

No remaining actionable P0/P1/P2 findings.

## Follow-up Polish

- P3: replace the mock Airwallex adapter with server-side authenticated calls to the official Form Schema, validate, and create endpoints.

### Iteration 22: Contract Detail Workspace Layout

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-bf03883c-e0d5-4768-9482-10e8eddfb7f8.png` (1538 x 721 px at 1x).
- Browser-rendered implementation: `qa/contract-workspace-desktop.png` (1265 x 1167 px full-page capture from a 1280 x 720 CSS viewport at 1x).
- Combined evidence: `qa/contract-workspace-comparison.png` (2344 x 757 px). Both sides are normalized to a maximum height of 721 px and labeled in one image.
- State: local test environment only, authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`, with contract status `履约中`.
- Full-view comparison: the implementation follows the requested hierarchy. The 945 px status board spans the full content width; its 414.9 px bottom edge sits above the workspace at 434.9 px. The PDF viewer and obligations panel share the same 434.9 px top edge, with widths of 551 px and 380 px respectively.
- Focused comparison was not required because the requested change concerns major-region hierarchy and alignment rather than typography or document content. The full-view evidence keeps the status board, document toolbar, PDF content, obligations header, and multiple obligation rows legible.
- Responsive behavior: `.contract-document-layout` switches from the desktop `minmax(0, 1fr) minmax(330px, 380px)` grid to one column at 1180 px. The existing 860 px mobile treatment continues to replace the embedded frame with the page preview and actions. The desktop document measured `clientWidth: 1265` and `scrollWidth: 1265`, confirming no horizontal overflow.
- Browser console: zero warnings and zero errors; only Vite connection diagnostics and the React development notice were present.
- Automated: TypeScript passed; Vitest 26/26 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: existing COMETS hierarchy, weights, zero letter spacing, truncation, and PDF rendering are unchanged.
  - Spacing and layout rhythm: the status board is separated from the lower workspace by 20 px; the lower columns use a 14 px gap and aligned 8 px cards, matching the compact management-console rhythm.
  - Colors and visual tokens: existing neutral operational surfaces, lavender resource icons, semantic lifecycle colors, borders, and shadows remain unchanged.
  - Image quality and asset fidelity: the original vector PDF stays embedded in the main column and the existing sharp mobile page preview remains available below 860 px.
  - Copy and content: contract metadata, five lifecycle states, all six extracted obligations, clause references, timing, and PDF actions are preserved.

### Iteration 23: Grouped Contract Obligations

- Source visual truths: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-f1bc7c01-e0e4-4cda-80af-15a000f3d3f6.png` (1396 x 529 px at 1x) for the bounded right rail and `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-dcbbcd6b-5ce0-4f2c-8ca4-0688c5559aa2.png` (538 x 556 px at 1x) for numbered item anatomy.
- Browser-rendered implementation: `qa/contract-obligations-grouped-top.png` (1265 x 1167 px full-page capture from a 1280 x 720 CSS viewport at 1x).
- Focused implementation: `qa/contract-obligations-claim-visible.png` (1265 x 720 px viewport capture) verifies the bottom of the rail and the complete `请款内容` section after internal scrolling.
- Combined evidence: `qa/contract-obligations-grouped-comparison.png` (943 x 724 px). The source and the 380 x 690 implementation rail are normalized to a shared 690 px content height and placed side by side.
- State: authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; the contract is `履约中`; the panel contains five `履约内容` items and one `请款内容` item.
- Full-view comparison: the implementation keeps the PDF and obligations rail side by side, reproduces the compact bordered numbered rows, and exposes explicit `重点`, `内容`, and `位置` labels for every item.
- Boundary behavior: the PDF viewer and obligations panel both measure 690 px high and end at the same `1124.921875` px document position. The obligations content measures 616 px client height and 885 px scroll height, so only its content region scrolls when the complete expanded list would exceed the PDF bottom edge.
- Responsive behavior: below 1180 px the workspace stacks and the obligation panel returns to automatic height with visible overflow content. The desktop document measured `clientWidth: 1265` and `scrollWidth: 1265`.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 26/26 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: compact COMETS type levels remain unchanged; key points are strongest, content is secondary, and location/timing use smaller readable labels without clipping.
  - Spacing and layout rhythm: 28 px numbered markers, 9 px list gaps, 8 px row radii, and consistent label columns reproduce the reference's dense ordered-list rhythm.
  - Colors and visual tokens: pale lavender sequence markers and counts, neutral borders, white rows, and gray supporting copy stay within the existing COMETS palette.
  - Image quality and asset fidelity: no new raster assets were required; the supplied contract PDF remains the live document source.
  - Copy and content: all six extracted obligations remain expanded and are grouped into `履约内容` and `请款内容`; every item includes sequence number, key point, content, location, and timing.

### Iteration 24: Management-Style Obligation Tabs

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-5ecbeaff-742e-474e-8c37-71007daacd95.png` (582 x 658 px at 1x).
- Browser-rendered implementation: `qa/contract-obligations-flat-fulfillment.png` (1265 x 1167 px full-page capture from a 1280 x 720 CSS viewport at 1x).
- Secondary interaction evidence: `qa/contract-obligations-flat-claim-viewport.png` (1265 x 720 px) verifies the functional `请款内容` tab and its single complete item.
- Combined evidence: `qa/contract-obligations-flat-comparison.png` (986 x 724 px). The source panel and the implementation's 380 x 690 right rail are normalized to a shared 690 px content height and placed side by side.
- State: authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; `履约内容` is initially selected with five items, while `请款内容` selects one item.
- Full-view comparison: the implementation matches the reference's white panel, compact horizontal tabs, black active underline, icon-led section heading, flat label/value anatomy, and divider-separated information rows. Nested obligation cards were removed.
- Interaction: both tabs update `aria-selected`, heading copy, item count, and visible content. `履约内容` renders 5 items; `请款内容` renders the full Invoice and payout requirement as 1 item.
- Boundary behavior: the right rail and PDF viewer both measure 690 px high and end at the same `1124.921875` px position. Internal scrolling remains available for the longer fulfillment tab.
- Browser console: zero warnings and zero errors. The desktop document measured `clientWidth: 1265` and `scrollWidth: 1265`.
- Automated: TypeScript passed; Vitest 26/26 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: compact tab labels, bold primary values, muted field labels, and secondary source/timing text match the management-detail hierarchy.
  - Spacing and layout rhythm: tabs use a 58 px header band, the active state uses a 2 px underline, and flat items use consistent 54 px label columns with divider lines instead of inset cards.
  - Colors and visual tokens: white surface, neutral dividers, black active indicator, lavender counts/icon treatment, and gray supporting copy align with the reference.
  - Image quality and asset fidelity: no new raster assets were required; the existing Lucide contract icon and supplied PDF remain sharp.
  - Copy and content: both requested categories remain available; every visible item includes sequence number, key point, content, contract location, and timing.

### Iteration 25: Compact Obligation Item Cards

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-c4621d0e-16f9-4d82-ab4b-9b869e5aeaf7.png` (545 x 305 px at 1x).
- Browser-rendered implementation: `qa/contract-obligations-compact-cards.png` (1265 x 1167 px full-page capture from a 1280 x 720 CSS viewport at 1x).
- Combined focused evidence: `qa/contract-obligations-compact-comparison.png` (949 x 339 px). The implementation list crop and source are placed at their native 1x density.
- State: authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; `履约内容` is initially selected with five items. The `请款内容` tab was also selected and verified with one item.
- Focused comparison: the implementation matches the supplied item anatomy with a light-purple numbered square, bold title, muted summary, small contract-position line, 8 px border radius, neutral border, and consistent vertical gaps.
- Copy behavior: literal field labels `序号`, `重点`, `内容`, and `位置` no longer render inside items. The redundant timing line was removed. The underlying title, summary, and clause-location content remains complete.
- Boundary behavior: the right rail and PDF viewer both measure 690 px high and end at `1124.921875` px. The desktop document measured `clientWidth: 1265` and `scrollWidth: 1265`.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 28/28 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: bold key points, smaller regular summaries, and muted clause references reproduce the source hierarchy without field-label noise.
  - Spacing and layout rhythm: 28 px number markers, 10 px row gaps, 11 px card padding, and 8 px radii closely match the supplied compact list.
  - Colors and visual tokens: pale lavender number blocks, neutral white cards, light gray borders, and muted support text align with the reference.
  - Image quality and asset fidelity: no raster or icon asset changes were needed; the list is rendered as native UI text and remains sharp.
  - Copy and content: every obligation keeps its sequence, key point, explanation, and contract location while removing only the requested labels and repeated timing.

### Iteration 26A: Responsive Contract Content Order

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-0236d1ec-b7c9-4c33-b43f-5d3869ec2bc7.png` (1738 x 780 px at 1x).
- Browser-rendered desktop evidence: `qa/contract-obligations-compact-cards.png`, cropped to the 1265 x 720 browser viewport for comparison.
- Combined evidence: `qa/contract-responsive-order-comparison-final.png` (2893 x 754 px). Source and implementation are normalized to a shared 720 px content height and placed side by side.
- State: authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; `履约内容` is active.
- Desktop comparison: at the 1280 px browser viewport the PDF viewer remains left of the 380 px obligations rail, matching the supplied wide layout. Both panels retain the same 434.921875 px top edge and there is no horizontal overflow.
- Responsive behavior: the browser-loaded final stylesheet contains `@media (max-width: 1180px)` with a one-column contract workspace and `.contract-obligations-card { height: auto; order: -1; }`. This places the obligation panel before the PDF viewer on narrower desktop, tablet, and mobile widths while preserving the desktop DOM and layout.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 29/29 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: no typography changes were introduced.
  - Spacing and layout rhythm: desktop proportions and the 14 px inter-column gap remain unchanged; only single-column visual order changes.
  - Colors and visual tokens: no palette, border, shadow, or status-token changes were introduced.
  - Image quality and asset fidelity: the supplied PDF and existing mobile preview remain unchanged.
  - Copy and content: contract status, fulfillment tabs, all obligation items, and contract document content are preserved.

final result: passed

### Iteration 49: Request Amount Information Tooltips

- Source callout: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-13c9330e-888b-4350-8d63-2d3ad7361310.png` (1455 x 170 px at 1x), highlighting the three amount-summary information icons.
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/request-home-amount-tooltip.png` (1280 x 720 px viewport capture with the first tooltip visible).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/request-home-amount-tooltip-mobile-320.png` (320 x 800 px viewport capture with the first tooltip visible).
- Combined focused evidence: `/Users/aria/Documents/支付系统c端/qa/request-home-amount-tooltip-comparison.png`, pairing the source callout with the implemented open-tooltip state.
- State: local test environment only, authenticated as Léa Martin on `/`; the user environment was not updated.
- Content: `请款中金额` explains the PM-review scope and exclusions; `待到账金额` covers finance review and blocked payout-material cases; `已完成金额` explains completed, received payouts.
- Interaction: every icon is a semantic button with a unique accessible name and `aria-describedby`. Mouse hover, keyboard focus, and mobile tap reveal the same explanation; moving focus to another icon closes the previous tooltip.
- Responsive behavior: the desktop tooltip remains anchored to its icon, and the 320 px treatment keeps the 238 px tooltip inside the viewport without changing the summary-card layout.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 50/50 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the source icons were initially decorative only. The final pass adds concise business definitions and visible interactive states while preserving the existing layout and amount calculations.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the compact summary labels and amount hierarchy remain unchanged; tooltip copy uses a legible 11 px operational style.
  - Spacing and layout rhythm: icon dimensions and summary-card geometry remain stable in closed state.
  - Colors and visual tokens: the neutral dark tooltip, restrained shadow, and existing information icon color match the COMETS operational palette.
  - Image quality and asset fidelity: the existing Lucide information icon is reused; no placeholder or custom-drawn asset was introduced.
  - Copy and content: all three explanations describe the current application's actual status grouping and totals.

final result: passed

### Iteration 47: Request Project Homepage Reference Match

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-4223e4a7-e0bf-455c-a374-1fb3214463e3.png` (1487 x 1058 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/request-home-reference-implementation.png` (1280 px browser viewport; full-page capture).
- Combined comparison: `/Users/aria/Documents/支付系统c端/qa/request-home-reference-comparison.png`. Both full views were normalized to a common 960 px height and placed side by side.
- Focused responsive evidence: `/Users/aria/Documents/支付系统c端/qa/request-home-reference-mobile-320.png` (320 x 800 px viewport capture). A separate crop was unnecessary because the complete mobile first screen contains the greeting, task panel, amount overview, filters, and first project card.
- State: local test environment only, authenticated as Léa Martin on `/`; the user environment at `192.168.88.188:8772` was not updated.
- Full-view comparison: the reference hierarchy is reproduced with the greeting, two-column pending-action strip, three compact amount summaries, search and status filters, four-row request table, inline `合同 → Invoice → 审批 → 付款` progress, and sidebar account summary.
- Data behavior: the homepage intentionally uses the current application records and derived totals rather than copying stale amounts or statuses from the visual reference. The four reference projects appear in the same order, while Invoice state changes continue to synchronize into the table.
- Interaction verification: project search reduced the result set to one matching row; the finance-status tab reduced it to one row; pending-signature and payout-repair actions expose the correct detail URLs; the Nebula Quest title navigated to its request detail and returned successfully.
- Responsive verification: at 320 px the table changes to four stacked cards, titles do not overflow, and document/body scroll width remains exactly 320 px.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 50/50 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.
- Iteration history: the first implementation displayed all eight cross-module mock projects and used only the first row's amount for the overview. The final pass scopes the homepage to the four reference projects, orders them to match the source, and aggregates same-currency totals correctly without modifying contract or Invoice module data.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: compact operational headings, row labels, amounts, metadata, filters, and status hierarchy match the reference's density.
  - Spacing and layout rhythm: sidebar, top bar, task strip, summary band, toolbar, four table rows, and footer preserve the source composition.
  - Colors and visual tokens: COMETS coral, purple, pink, amber, blue, green, and neutral borders are consistently reused.
  - Image quality and asset fidelity: the existing COMETS mark and Lucide icons remain sharp; no placeholder or generated asset was introduced.
  - Copy and content: section labels and progress-stage labels match the source; changing business records remain sourced from the application's current mock state.

final result: passed

### Iteration 40: Complete Contract Lifecycle Data

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-79d10fe1-08b1-4b70-9e12-4d35d7450cd2.png` (1477 x 712 px at 1x).
- Browser-rendered implementation: `qa/contract-lifecycle-list-desktop.png` (1463 x 704 px browser-content capture from a 1478 x 711 CSS viewport at 1x), `qa/contract-lifecycle-pending-payment-detail.png`, and `qa/contract-lifecycle-list-mobile.png` (375 px browser-content width from a 390 x 844 viewport).
- Combined full-view evidence: `qa/contract-lifecycle-list-comparison.png` (2962 x 712 px). Source and implementation were normalized to a shared 1477 x 712 px frame and placed side by side.
- State: local test environment only, authenticated as Léa Martin on `/contracts`.
- Data coverage: five contracts now cover `待签署`, `已生效`, `履约中`, `待付款`, and `已归档`, with unique contract/IO numbers, brands, amounts, effective dates, and update dates.
- Summary behavior: contract total is `5`, active/in-progress is `3`, and pending signature is `1`.
- Interaction: every status filter returns its single matching contract. All four new contract rows open a working detail route with the correct title, amount, current lifecycle step, embedded 16-page contract, and both obligation tabs.
- Responsive behavior: desktop renders the established seven-column table. At 390 x 844, all five records render as stacked cards, the desktop table is hidden, and the page has no horizontal overflow (`clientWidth = scrollWidth = 375`).
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 45/45 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Intentional source difference: the supplied reference capture excludes the authenticated shell and contains one contract. The implementation retains the product's existing sidebar/top bar and expands the same content design to five lifecycle examples as requested.
- Focused comparison was not needed: the full-view evidence keeps the filter controls, complete table, status pills, typography, and summary metrics readable at the normalized size.
- Comparison history: the first browser-rendered desktop and mobile captures had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: headings, metadata, amounts, table labels, action links, and status text reuse the established contract-page hierarchy without clipping or unintended wrapping.
  - Spacing and layout rhythm: summary metrics, search/filter toolbar, row density, borders, and responsive card spacing follow the existing COMETS operational layout.
  - Colors and visual tokens: each lifecycle state uses the existing semantic pill treatment while the active filter retains the COMETS coral accent.
  - Image quality and asset fidelity: the supplied COMETS mark, Lucide contract icons, and embedded standard-terms PDF remain sharp; no placeholder or synthetic image asset was added.
  - Copy and content: five realistic creator contracts expose the requested lifecycle coverage, unique commercial metadata, and consistent detail-page content.

final result: passed

### Iteration 44: Profile Card Header Icon Colors

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-646cad46-914f-4807-98e0-fcccb670f797.png` (1281 x 573 px at 1x).
- Browser-rendered implementation: `qa/profile-header-icon-colors-desktop.png` (1265 x 712 px at the default desktop viewport) and `qa/profile-header-icon-colors-payout.png` (1265 x 712 px at the same viewport and a lower page position).
- Focused implementation crop: `qa/profile-header-icon-colors-focused.png` (933 x 528 px).
- Combined comparison evidence: `qa/profile-header-icon-colors-comparison.png` (2319 x 574 px). The source and focused implementation were normalized to a shared 574 px height while preserving aspect ratio.
- State: authenticated as Léa Martin on `/profile` in read-only mode.
- Full-view evidence: the implementation preserves the reference card widths, white surfaces, compact 32 px icon containers, title/subtitle alignment, card spacing, field grid, and status placement.
- Focused evidence: the source and implementation are placed together so the social-account and Invoice-contact card headers remain readable. Social accounts retain the requested blush treatment while Invoice contact details use a distinct light blue.
- Lower-page evidence: `qa/profile-header-icon-colors-payout.png` verifies light green for payout channel, light lilac for payout scenario, and light amber for Airwallex bank details.
- Browser console: zero warnings and zero errors; only Vite connection and React development information messages were present.
- Automated verification: TypeScript passed; Vitest 48/48 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Responsive scope: this change modifies only background and foreground colors on fixed 32 px icon containers, so existing card geometry and responsive behavior are unchanged.
- Comparison history: the first browser-rendered comparison had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: all existing heading, subtitle, label, and field typography remains unchanged.
  - Spacing and layout rhythm: icon dimensions, 8 px radius, 10 px header gap, card padding, dividers, and form alignment match the existing reference.
  - Colors and visual tokens: blush, light blue, light green, light lilac, and light amber provide distinct low-saturation section cues while remaining consistent with the COMETS operational palette.
  - Image quality and asset fidelity: existing Lucide icons remain crisp and no raster or placeholder asset was introduced.
  - Copy and content: all card titles, descriptions, account data, fields, and statuses remain unchanged.

final result: passed

### Iteration 36: Concise Contract Claim Extraction

- Contract source: `/Users/aria/Documents/26-kol-standard-terms-template.pdf`, standard clauses 3.2, 3.3, 3.5, 3.6 and IO clause 5.
- State: local test environment only on `/contracts/CON-260724-KOL-01`; no remote Mac update was performed.
- Content: `请款内容` now contains exactly six concise rows: Invoice, payment, payment method, transfer fees, payout account, and account requirements.
- Source integrity: the UI preserves `[60/45]`, blank bank and PayPal fields, and all three unselected transfer-fee options as unresolved contract facts.
- Data integrity: no account number or masked suffix is inferred from the creator profile or screenshot examples.
- Automated: TypeScript passed; Vitest 36/36 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Local availability: `http://localhost:4173/contracts/CON-260724-KOL-01` returns HTTP 200.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 34: Creator-First Claim Information

- Contract source: `/Users/aria/Documents/26-kol-standard-terms-template.pdf` (16 pages), with payment evidence reviewed from standard clauses 3.1-3.7 and IO clause 5.
- State: local test environment only, authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; the `请款内容` tab is selected.
- Information architecture: the panel now answers nine creator payment questions: claimable amount, claim eligibility, Invoice deadline, installment arrangement, expected arrival time, required materials, account requirements, creator-borne costs, and late-payment remedies.
- Source integrity: every answer retains a clause and page citation. `EUR 8,500` is identified as linked structured contract data because the PDF fee field is a template placeholder.
- Unresolved terms: `[60/45]` working days and normal wire-fee allocation display `待确认`; the bank and PayPal fields remain disclosed as blank instead of being inferred.
- Action readiness: the bottom `请款前待确认` checklist covers the final payment term, fee allocation, actual payout channel/account, final IO, and Beneficiary-to-Invoice consistency.
- Browser verification: all nine rows and the warning checklist render; the checked 1140 px layout has no horizontal overflow (`clientWidth` and `scrollWidth` both 1140 px).
- Automated: TypeScript passed; Vitest 36/36 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Environment: changes remain on `http://localhost:4173`; no update was sent to `http://192.168.88.188:8772`.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 26: Invoice Verification Liability And Action Order

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-5d1badd5-cd35-4385-a439-70ca29f7612e.png` (1907 x 818 px at 1x).
- Browser-rendered implementation: `qa/invoice-actions-refined.png` (1892 x 812 px capture from a 1907 x 818 CSS viewport at 1x).
- Combined evidence: `qa/invoice-actions-comparison.png` (2424 x 559 px). Source and implementation were normalized to the same 1200 px comparison width and placed side by side.
- Focused evidence: `qa/invoice-issue-modal-refined.png` verifies the modal typography, controls, icon container, spacing, and disabled-submit state.
- State: local test environment only, authenticated as Léa Martin on the stable unsigned Invoice flow. The implementation capture uses `INV-260727-DEMO` because the browser's persisted `INV-260727-S` record had already advanced to review; both records render the same Invoice detail shell and supplied PDF.
- Full-view comparison: the implementation preserves the reference hierarchy, adds a two-level verification and responsibility notice in the annotated full-width band, and keeps all actions inside the existing processing card.
- Interaction and measurements: the action order is `Invoice 信息有误` → `签署 Invoice` → `下载 Invoice`; both measured inter-button gaps are exactly 10 px and all buttons are 42 px high. The issue dialog uses the system font stack, a 16 px title, 10 px description, 11 px field labels, 20 px padding, 16 px section gap, and 8 px radius.
- Responsive and overflow: the desktop document measured `clientWidth: 1892` and `scrollWidth: 1892`, confirming no horizontal overflow.
- Browser console: zero errors.
- Automated: TypeScript passed; Vitest 28/28 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the notice retains the compact operational hierarchy, while the issue dialog now matches the existing signature dialog's font family and title/supporting-copy scale.
  - Spacing and layout rhythm: all three processing-card actions use one grid with a uniform 10 px gap; individual button margins no longer create inconsistent spacing.
  - Colors and visual tokens: the existing amber verification treatment, coral issue action, black signature action, and neutral download action are preserved.
  - Image quality and asset fidelity: the supplied Invoice PDF rendering remains unchanged and sharp; no new image asset was required.
  - Copy and content: the notice names the project, payout details, amount, and currency, directs creators to report inaccuracies before signing, and states creator responsibility for payment failures, returns, and related fees caused by verification omissions.

final result: passed

### Iteration 27: Management-Style Dynamic Payout Profile

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-f647362d-a3c2-433a-84dc-f84ddc8e062a.png` and `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-ab291921-df2e-4466-afb1-84110babf75e.png`.
- Browser evidence: `qa/profile-airwallex-dynamic-desktop.png`, `qa/profile-airwallex-mobile-viewport.png`, and `qa/profile-airwallex-mobile-scenario.png`.
- Structure: the creator profile now follows the management-profile hierarchy with a creator summary banner, four compact overview metrics, social accounts, Invoice contact details, payout channel, a standalone payout-scenario section, and generated payout details.
- Dynamic behavior: all four scenario inputs are editable in profile edit mode. Switching to the United States local-transfer Schema displayed ABA routing and account-type fields while removing the previous required IBAN/bank-code fields.
- Beneficiary type and transfer-method behavior: switching to `COMPANY` replaced personal identity supplements with the company registration field; switching to `SWIFT` displayed required SWIFT and bank-address fields and removed the prior local bank-code requirement.
- Validation: saving an incomplete United States Schema produced the expected `ABA 路由号码为必填项` blocking dialog. Schema values are reconciled before persistence so obsolete scenario-only fields are removed.
- Responsive and overflow: the 390 x 844 mobile viewport rendered the four scenario controls in one column and the generated payment fields below them. The document remained at `scrollX: 0`; the closed drawer finished at `right: -5.72`.
- Browser console: zero errors.
- Automated: TypeScript passed; Vitest 28/28 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 28: Dual-Method Invoice Signature

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-83b7de32-4b97-4257-bcf5-c44c1c050f63.png`.
- State: local test environment only, authenticated as Léa Martin on `INV-260727-DEMO`.
- Structure: the existing management-style modal now offers `手写签名` and `生成电子签名`. The generated path uses the Airwallex account holder name `Lea Martin` and presents four selectable styles: `经典`, `流畅`, `简约`, and `个性`.
- Legal safeguard: both methods share an explicit legal-effect declaration. The confirmation action remains disabled until a signature exists and the creator checks the declaration.
- Accessibility: the method switch is a tablist, generated options are a radio group with selected state, the legal confirmation is a named checkbox, and the primary action exposes its disabled state.
- Responsive behavior: the generated options retain a compact two-column grid at narrow widths; the modal is height-bounded and scrollable, while its footer actions remain full-width and reachable.
- Browser verification: the generated-signature tab rendered all four account-name styles and the legal checkbox; the confirmation button was disabled before the required inputs were completed. No runtime console errors were observed during the checked flow.
- Automated: TypeScript passed; Vitest 29/29 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 29: Platform-Specific Social Account Names

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-d8cfa0e5-3297-4151-bb8b-31481e145cd1.png` (1881 x 878 px at 1x).
- Browser-rendered implementation: `qa/profile-social-account-names.png` (1140 x 890 px browser-content capture from a 1155 x 902 CSS viewport at 1x).
- Combined full-view evidence: `qa/profile-social-account-names-comparison.png` (2485 x 754 px). Source and implementation were normalized to a shared 720 px content height and placed side by side.
- Focused evidence: `qa/profile-social-account-names-focus-comparison.png` (2198 x 264 px). The social-account sections were cropped from their respective full views, normalized to a shared 230 px content height, and placed side by side.
- State: local test environment only, authenticated as Léa Martin on `/profile`.
- Content verification: the YouTube card renders `@LeaPlayFR`; the Instagram card renders `@leaplayfr`. Each value is derived from that card's own profile URL, with the saved shared handle used only as a malformed-link fallback.
- Responsive and overflow: the checked document measured `clientWidth: 1140` and `scrollWidth: 1140`; both 386.5 px social cards retained their original height and alignment.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 33/33 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first browser-rendered pass had no actionable P0/P1/P2 findings, so no visual fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the existing platform-name and secondary-account-name hierarchy is unchanged; only the correct per-platform string differs.
  - Spacing and layout rhythm: card dimensions, grid gap, icon placement, status badges, and external-link actions remain unchanged.
  - Colors and visual tokens: existing white surfaces, neutral borders, peach platform icons, and green verification states remain unchanged.
  - Image quality and asset fidelity: no new image asset was required; the existing COMETS mark and UI icons remain sharp.
- Copy and content: each card now displays its own account name, matching the requested behavior and the supplied profile URLs.

final result: passed

### Iteration 30: Contract Claim Rules

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-ff3158ae-8eca-4678-9f8e-f2b62230a133.png` (492 x 420 px at 1x).
- Browser-rendered implementation: `qa/contract-claim-rules.png` (1265 x 1167 px full-page capture from a 1280 x 720 CSS viewport at 1x).
- Combined focused evidence: `qa/contract-claim-rules-comparison.png` (874 x 454 px). The source and implementation claim panels are normalized to a shared 420 px content height and placed side by side.
- State: authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; the `请款内容` tab is selected.
- Content verification: the panel shows project total fees `EUR 8,500`, Invoice issue timing, 45-business-day payment timing, bank-transfer method, Advertiser fee responsibility, and masked account snapshot `Léa Martin · ···· 4821`.
- Consistency note: the bottom callout states that actual payment uses the verified Beneficiary from the creator profile and that the contract account is checked against the Invoice.
- Boundary behavior: the claim panel and PDF viewer both measure 690 px high and share the same `1020.921875` px bottom edge. The document has no horizontal overflow.
- Interaction: switching back to `履约内容` restores the original five extracted obligation cards.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 33/33 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: muted left labels, bold right values, compact heading hierarchy, and mixed Chinese/English copy match the supplied rule panel.
  - Spacing and layout rhythm: six equal divider-separated rows, a 120 px label track, and a full-width bottom notice reproduce the reference anatomy.
  - Colors and visual tokens: white panel, neutral dividers, lavender document icon, and pale-blue Beneficiary callout match the source treatment.
  - Image quality and asset fidelity: existing Lucide receipt and bank icons remain crisp; no raster assets were introduced.
- Copy and content: all six rules and the Beneficiary/Invoice consistency message are present without changing fulfillment obligations.

final result: passed

### Iteration 31: Post-Signing Invoice Cleanup

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-bae261bf-985a-4501-a61f-b55147319313.png` (1783 x 805 px at 1x).
- Browser-rendered implementation: `qa/invoice-post-signing-cleanup.png` (1140 x 891 px capture from a 1155 x 903 CSS viewport at 1x).
- Combined evidence: `qa/invoice-post-signing-comparison.png` (2424 x 724 px). The annotated reference and signed implementation are shown in equal-width panels with top alignment.
- State: authenticated as Léa Martin on the signed `INV-240718` record in `PENDING_REVIEW`.
- Full-view comparison: the pre-signing verification notice and `Invoice 信息有误` action identified by the reference red boxes are absent. The Invoice document moves directly below the page heading, and the right processing card retains its timeline, review estimate, and download action without an empty action slot.
- Focused evidence was not required because both requested removals are clearly readable at the full-view comparison scale.
- Interaction regression check: unsigned `INV-260727-DEMO` still renders one verification notice, one issue-feedback action, and one signature action. The signed record renders zero verification notices and zero issue-feedback actions while retaining one download action.
- Responsive and overflow: the signed desktop view measured 1155 px wide with 1140 px document scroll width, so the cleanup introduced no horizontal overflow.
- Browser console: zero warnings and zero errors on both signed and unsigned states.
- Automated: TypeScript passed; Vitest 34/34 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: unchanged; the existing management-console hierarchy remains intact.
  - Spacing and layout rhythm: the document workspace closes the removed notice gap naturally, and the remaining right-card actions keep their established spacing.
  - Colors and visual tokens: no token changes were needed; signed-state surfaces retain the neutral, blue, green, and amber operational colors.
  - Image quality and asset fidelity: the supplied Invoice PDF preview, COMETS mark, and existing icons remain unchanged and sharp.
- Copy and content: all pre-signing-only copy disappears after signing; review status, timeline, estimate, and download access remain visible.

final result: passed

### Iteration 32: Supplemental Information Reminder

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-8a5f57f5-eec6-4e42-8a01-8377bc09607a.png` (1340 x 596 px at 1x).
- Browser-rendered desktop implementation: `qa/profile-supplemental-reminder-desktop.png` (1140 x 890 px browser-content capture from a 1155 x 902 CSS viewport at 1x).
- Browser-rendered mobile implementation: `qa/profile-supplemental-reminder-mobile.png` (375 x 832 px browser-content capture from a 390 x 844 CSS viewport at 1x).
- Combined focused evidence: `qa/profile-supplemental-reminder-comparison.png` (1970 x 564 px). The source supplemental section and implementation section were cropped, normalized to a shared 530 px content height, and placed side by side.
- State: local test environment only, authenticated as Léa Martin on `/profile`; the saved payout scenario is Japan, EUR, individual beneficiary, and local transfer.
- Content verification: a `role="note"` reminder appears between the supplemental heading and fields. It encourages creators to complete as much information as possible so future changes to payout country, currency, account type, or transfer method can be matched and validated faster, reducing document follow-ups, payment returns, and repeated edits.
- Layout verification: the desktop reminder measures 782 x 54.71875 px and preserves the two-column field grid. At the mobile viewport it measures 313 x 84.15625 px, wraps naturally above the single-column fields, and keeps all copy readable.
- Responsive and overflow: desktop measured `clientWidth: 1140` and `scrollWidth: 1140`; mobile measured `clientWidth: 375` and `scrollWidth: 375`.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 34/34 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first browser-rendered pass had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the reminder uses the existing compact management-console hierarchy with a short semibold title and smaller readable supporting copy.
  - Spacing and layout rhythm: the note sits 10 px below the section heading and 12 px above the fields; it does not alter the field grid or input dimensions.
  - Colors and visual tokens: the pale-lavender surface, neutral-purple border, and muted information icon align with the existing COMETS operational palette without implying an error or mandatory action.
  - Image quality and asset fidelity: the existing Lucide information icon remains sharp; no raster asset was required.
  - Copy and content: the reminder explains the practical benefit and names the three avoidable forms of rework while preserving the optional-field meaning.

final result: passed

### Iteration 32: Source-Grounded Contract Claim Rules

- Contract source: `/Users/aria/Documents/26-kol-standard-terms-template.pdf` (16 pages).
- Rendered source evidence: `tmp/pdfs/contract-payment-04.png`, `tmp/pdfs/contract-payment-05.png`, `tmp/pdfs/contract-payment-06.png`, `tmp/pdfs/contract-io-14.png`, and `tmp/pdfs/contract-io-15.png`.
- Browser-rendered implementation: `qa/contract-claim-extracted-top.png`, `qa/contract-claim-extracted-bottom.png`, and `qa/contract-claim-extracted-warning.png` at a 1280 x 720 CSS viewport.
- State: authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; the `请款内容` tab is selected.
- Extraction coverage: standard clauses 3.1-3.7 and IO clause 5 were reviewed. The UI exposes nine source-backed rows with clause/page citations.
- Confirmed content: Invoice issuance within three working days after final acceptance; one-installment 100% payment; accurate and complete beneficiary information; each party's own taxes; account/Invoice consistency; and 0.3% daily late-payment interest.
- Unresolved content: IO payment timing remains `[60/45]` working days, wire-fee responsibility is not selected, and both bank and PayPal account fields are blank. These are explicitly shown as unresolved.
- Structured contract data: `EUR 8,500` remains visible as the linked contract amount, while the UI states that the PDF page-14 fee field is still a template placeholder.
- Browser behavior: the nine rows use an internally scrollable 630 px region with 740 px scroll height; the bottom warning is reachable and the document has no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 34/34 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- [P1] The prior implementation treated screenshot examples as signed contract facts.
  Fix: remove definitive bank-transfer, Advertiser-fee, 45-day, and masked-account claims; replace them with PDF-derived clauses, unresolved-state disclosure, and source citations.
  Post-fix evidence: rendered contract pages 4-6 and 15 plus `qa/contract-claim-extracted-warning.png`.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 33: Rejected Invoice Record

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-68dd8a68-3b88-45b3-b56f-1f7171636fb1.png` (1432 x 537 px at 1x).
- Browser-rendered implementation: `qa/invoice-rejected-list.png` (1432 x 537 px capture from a 1432 x 537 CSS viewport at 1x).
- Combined evidence: `qa/invoice-rejected-list-comparison.png` (2888 x 585 px). Source and implementation are shown at the same pixel size and density.
- Detail evidence: `qa/invoice-rejected-detail.png` verifies the rejection-reason alert, rejected review node, and `重新提交审核` action.
- State: authenticated as Léa Martin with the `审核退回` tab selected. The tab count is `1`, the former empty state is gone, and `INV-260728-R` is the only visible row.
- Data consistency: legacy cached `INV-240711-C` rejection data migrates to `待审核`, while the new current rejection remains linked to the existing `七月联名` request project.
- Interaction: opening the row displays the reason `Invoice 中的收款账户名与达人档案不一致，请核对并更新收款资料后重新提交审核。`; one resubmission action is available and transitions the record to pending review.
- Responsive and overflow: the desktop capture has no horizontal overflow. The existing mobile stacked-row behavior is unchanged because this iteration adds data and migration logic without changing list layout styles.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 36/36 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first browser pass exposed two rejected rows because legacy local storage overrode the updated seed. A migration was added, and the post-fix capture shows the intended single current rejection.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the new row uses the existing Invoice ID, project, amount, metadata, and status hierarchy.
  - Spacing and layout rhythm: the row fills the established six-column grid and replaces the empty state without changing table or tab dimensions.
  - Colors and visual tokens: the rejected badge uses the existing danger treatment; all surrounding operational colors remain unchanged.
  - Image quality and asset fidelity: existing COMETS branding and Lucide Invoice/action icons remain sharp; no new image asset was required.
  - Copy and content: the row includes Invoice number, project, Airwallex channel, amount, rejected status, actions, and an actionable rejection reason in detail.

final result: passed

### Iteration 35: Remove Mandatory Trade Amount

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-896acc2b-e927-4dbd-9044-d5df092a6bf2.png` (1439 x 671 px at 1x).
- Browser-rendered implementation: `qa/profile-mandatory-trade-amount-removed.png` (1140 x 890 px browser-content capture from a 1155 x 902 CSS viewport at 1x).
- Combined focused evidence: `qa/profile-mandatory-trade-amount-comparison.png` (1818 x 534 px). The source section with the field present and the implementation section with the field removed were cropped, normalized to a shared 500 px content height, and placed side by side.
- State: local test environment only, authenticated as Léa Martin on `/profile`; the saved payout scenario is Japan, EUR, individual beneficiary, and local transfer.
- Content verification: `申报交易金额 / Mandatory trade amount` is absent from the rendered supplemental-field labels. The first generated fields are now primary routing-code type, SWIFT/BIC, IBAN, and bank street address.
- Generation behavior: the field was removed from `buildProfileSupplementalFields`, so changing country, currency, beneficiary type, or transfer method cannot regenerate it.
- Layout verification: the remaining fields automatically refill the two-column grid below the existing supplemental-information reminder; no blank reserved slot remains.
- Responsive and overflow: the checked document measured `clientWidth: 1140` and `scrollWidth: 1140`.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 36/36 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first browser-rendered pass had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: unchanged; remaining field labels keep the established bilingual hierarchy.
  - Spacing and layout rhythm: the grid closes the removed field's space automatically and retains the existing two-column alignment and full-width address row.
  - Colors and visual tokens: unchanged; the reminder, field surfaces, borders, and disabled states keep the existing COMETS palette.
  - Image quality and asset fidelity: no asset changes were required.
  - Copy and content: the requested field and label are removed while all other supplemental payout fields remain available.

final result: passed

### Iteration 37: Rejected Invoice Payout Repair Loop

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-3ebbff50-43a5-4c7e-9cbb-cf831db72ef9.png` (1790 x 794 px).
- Browser-rendered implementation: `qa/invoice-payment-repair-rejected.png` (1265 x 712 px) and `qa/invoice-payment-repair-mobile.png` (375 x 844 px viewport).
- Combined evidence: `qa/invoice-payment-repair-comparison.png`.
- State: authenticated as Léa Martin on `/invoices/INV-260728-R`; the Invoice is rejected because `银行账号 / Bank account number` failed payout validation.
- Rejection content: the detail identifies the exact bilingual field, masks the current value as `···· 0189`, explains the Airwallex verification failure and payment-return risk, and provides a three-step repair path.
- Interaction: `重新提交审核` is disabled before repair. `修改付款信息` opens `/profile` in editing mode, scrolls to the payout section, highlights the bank-account field, and blocks an unchanged value.
- Validation: changing the account number, passing the generated Airwallex Schema validation, creating the Beneficiary, and saving the profile marks the issue resolved. The success dialog returns to the Invoice, where resubmission is enabled.
- State integrity: the service layer independently blocks premature resubmission, rejects an unchanged invalid value, persists `resolvedAt`, and transitions the Invoice to `PENDING_REVIEW` only after repair.
- Responsive and overflow: the 375 px mobile viewport has no horizontal overflow (`clientWidth = scrollWidth = 375`); the status card, repair actions, and document viewer stack vertically.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 42/42 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the rejection uses the existing compact operational hierarchy with a 13 px title, 10-11 px detail copy, and bilingual field label.
  - Spacing and layout rhythm: the alert, field metadata, guidance steps, processing card, and actions use the established 8-12 px rhythm.
  - Colors and visual tokens: the unresolved state uses the system danger palette; successful repair switches to the existing green validation treatment.
  - Image quality and asset fidelity: the supplied Invoice PDF image and Lucide icons remain unchanged and sharp.
  - Copy and content: the flow names the exact payout error, explains the consequence, directs the creator to the correct field, and prevents resubmission until validation succeeds.

final result: passed

### Iteration 38: Contract Claim Demo Disclosure

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-0ee9011d-98b7-49d0-bcac-852c7d9e7eb4.png` (1398 x 632 px at 1x).
- Browser-rendered implementation: `qa/contract-claim-demo-notice-scrolled.png` (1385 x 632 px viewport capture) and `qa/contract-claim-demo-notice-mobile-viewport.png` (375 x 844 px browser-content capture from a 390 x 844 viewport).
- Focused comparison evidence: `qa/contract-claim-demo-notice-comparison.png` places the source and implementation claim panels side by side at a normalized 570 px content height.
- State: local test environment only, authenticated as Léa Martin on `/contracts/CON-260724-KOL-01`; `请款内容` is selected.
- Intentional product difference: the implementation adds a single pale-purple `演示数据说明` notice above `合同请款信息`. It states that the values are for demonstration, are not a payment basis, and will be replaced by contract/IO parsing in production; blank or unselected clauses will be marked pending confirmation.
- Content verification: all six rows display `合同已明确`; row-level `模拟数据` badges and mock wording in source citations are removed.
- Desktop layout: the claim panel remains 380 x 690 px, the notice is 346 x 76.4375 px, and the existing compact row rhythm and internal panel boundary are preserved.
- Mobile layout: the notice is 323 x 89.234375 px, wraps without clipping, and the document has no horizontal overflow (`clientWidth = scrollWidth = 375`).
- Primary interaction: switching from `履约内容` to `请款内容` selects the correct tab and renders the notice plus six claim rows.
- Browser console: zero warnings and zero errors on desktop and mobile.
- Automated: TypeScript passed; Vitest 41/41 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change desktop and mobile captures had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the notice uses the existing compact operational hierarchy; row labels, values, citations, and green status badges retain the reference weights and line heights.
  - Spacing and layout rhythm: the notice adds one clear information layer above the heading without changing the six-row grid, dividers, or adjacent PDF viewer proportions.
  - Colors and visual tokens: the notice uses the COMETS pale-purple information treatment; all six row states use the existing green confirmed token.
  - Image quality and asset fidelity: the supplied contract PDF, COMETS mark, and existing Lucide document/information icons remain unchanged and sharp.
  - Copy and content: simulation disclosure is centralized, production synchronization behavior is explained, and repeated row-level mock labels are removed.

final result: passed

### Iteration 39: Invoice Fuzzy Search

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-29f2536e-309c-4c32-9f04-055b8a5fb66f.png` (1780 x 761 px).
- Browser-rendered implementation: `qa/invoice-list-search-wide.png` (1775 x 787 px at a 1790 x 794 viewport), filtered state `qa/invoice-list-search-filtered.png`, and mobile state `qa/invoice-list-search-mobile.png` (390 x 844 px).
- Combined full-view evidence: `qa/invoice-list-search-comparison.png`; the implementation was normalized to the source's 761 px height while preserving aspect ratio.
- State: authenticated as Léa Martin on `/invoices`, with the existing six-column desktop list and status tabs intact.
- Search coverage: Invoice ID, project, brand, Airwallex channel, amount, status label, issue date, and update time. Multiple terms must each match the combined searchable fields.
- Interactions: `260728` returns one Invoice; `Mellow 2100` returns two records; combining it with the `审核退回` tab returns one record; an unmatched query shows a dedicated empty state; the clear icon restores the active tab's records.
- Responsive behavior: above 1180 px the search sits at the right of the status tabs. At 1180 px and below it moves beneath the horizontally scrollable tabs; native tab scrollbars are hidden. At 390 px, search and tabs both measure 340 px and the document has no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 43/43 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the search uses the existing 11 px compact form typography and the list hierarchy remains unchanged.
  - Spacing and layout rhythm: the 38 px search control uses the existing 8 px radius and aligns with the 65 px desktop tab toolbar; narrower viewports use a 10 px stacked gap.
  - Colors and visual tokens: neutral border, white surface, muted icon, and light-purple focus ring reuse the current COMETS operational palette.
  - Image quality and asset fidelity: the supplied COMETS mark and existing Lucide search/clear icons remain sharp; no new raster asset was required.
  - Copy and content: the placeholder names the primary searchable entities, and the empty state suggests the supported search dimensions without adding instructional clutter to the default view.

final result: passed

### Iteration 41: Scoped Invoice Search And Channel Filter

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-859800cb-0aa9-4065-8a48-71e6ce2b90b0.png` (1541 x 757 px).
- Browser-rendered implementation: `qa/invoice-channel-filter-desktop.png` (1526 x 750 px at a 1541 x 757 viewport) and `qa/invoice-channel-filter-mobile.png` (390 x 844 px).
- Combined full-view evidence: `qa/invoice-channel-filter-comparison.png`; the implementation was normalized to the source's 757 px height while preserving aspect ratio.
- State: authenticated as Léa Martin on `/invoices`, with all status tabs visible and the channel filter set to `全部渠道` in the desktop comparison.
- Search scope: only Invoice ID and related project name are searchable. `七月联名` returns two records and `260728` returns one; brand-only `Mellow Home`, amount `2100`, and status `审核退回` no longer match.
- Channel filtering: the select offers `全部渠道` and channel values derived from the current Invoice data. Selecting `Airwallex` combines with text search and the active status tab.
- Responsive behavior: the desktop search and channel select share the annotated right-side toolbar area. At 390 px they stack below the scrollable tabs at 340 px width each; the document has no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 48/48 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: both controls use the established 11 px compact form typography and preserve the table hierarchy.
  - Spacing and layout rhythm: the 240 px search and 142 px channel select share a consistent 38 px height, 8 px gap, and 8 px radius.
  - Colors and visual tokens: white surfaces, neutral borders, muted icons, and light-purple focus rings match existing COMETS operational controls.
  - Image quality and asset fidelity: the supplied COMETS mark and existing Lucide search, wallet, and clear icons remain sharp; no new image assets were required.
  - Copy and content: the placeholder now names only Invoice and related project, while the separate `全部渠道` control makes the payment-channel dimension explicit.

final result: passed

### Iteration 42: Three-State Contract Payment Lifecycle

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-b8d06a4b-d444-4480-aaf8-a26165d54b32.png` (1531 x 793 px at 1x).
- Browser-rendered implementation: `qa/contract-payment-statuses-desktop.png` (1517 x 785 px browser-content capture from a 1532 x 793 CSS viewport at 1x) and `qa/contract-payment-statuses-mobile.png` (375 px browser-content width from a 390 x 844 viewport).
- Combined full-view evidence: `qa/contract-payment-statuses-comparison.png` (3070 x 793 px). Source and implementation were normalized to a shared 1531 x 793 px frame and placed side by side.
- State: local test environment only, authenticated as Léa Martin on `/contracts`.
- Status model: creator-facing contracts now use only `履行中`, `待付款`, and `已付款`. The former pending-signature, effective, fulfillment, and archived status records are absent.
- Data coverage: nine contracts render, with three realistic agreements in each supported status. Every contract has a unique contract number, IO number, project, brand, amount, effective date, service period, and update date.
- Summary behavior: the three overview tiles map directly to the supported statuses and each displays `3`.
- Interaction: each status tab returns exactly three matching rows. Representative detail pages show the three-stage lifecycle correctly: active contracts begin at `履行中`, pending-payment contracts complete the first stage, and paid contracts complete the first two stages.
- Responsive behavior: desktop retains the seven-column table and scrolls vertically for the enriched data set. At 390 x 844, all nine records render as stacked cards, the desktop table is hidden, and the page has no horizontal overflow (`clientWidth = scrollWidth = 375`).
- Browser console: zero warnings and zero errors.
- Automated: TypeScript passed; Vitest 48/48 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Intentional source difference: the reference shows the prior five-state data and a content-area crop. The implementation preserves the existing authenticated shell and replaces the highlighted status area, summary counts, and contract rows with the requested three-state model.
- Focused comparison was not needed because the normalized full-view evidence keeps the overview tiles, all four filter controls, seven table columns, and visible status pills readable.
- Comparison history: the first browser-rendered desktop and mobile captures had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: existing heading, metric, filter, table, amount, metadata, and action-link hierarchy remains unchanged and readable.
  - Spacing and layout rhythm: the three overview tiles, four filter controls, row density, borders, and responsive card spacing preserve the reference's established structure.
  - Colors and visual tokens: `履行中` uses the existing purple status treatment, `待付款` uses blue, and `已付款` uses green; the active filter retains the COMETS coral accent.
  - Image quality and asset fidelity: the supplied COMETS mark, Lucide contract icons, and embedded contract PDF remain sharp; no placeholder or generated asset was introduced.
  - Copy and content: status wording is consistent across types, filters, overview tiles, rows, mobile cards, request linkage, and contract-detail lifecycle boards.

final result: passed

### Iteration 43: Contract Amount Typography Alignment

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-0546e9e6-70ec-4093-91dd-f8bebb8a1b2e.png` (1349 x 429 px at 1x).
- Browser-rendered implementation: `qa/contract-amount-typography.png` (1015 x 430 px element-region capture from a 1350 x 700 CSS viewport at 1x).
- Combined focused evidence: `qa/contract-amount-typography-comparison.png` (2375 x 430 px). Both contract-table regions were normalized to a shared 430 px height and placed side by side.
- State: local test environment only, authenticated as Léa Martin on `/contracts`, with all six Invoice-linked contracts visible.
- Typography verification: browser-computed styles for `.contract-table-title strong` and `.amount-cell` now match exactly: identical Inter/system font stack, `10.5px` font size, `700` weight, and `normal` line height.
- Layout verification: the amount column retains its existing width and alignment; row heights, status pills, dates, actions, and responsive behavior are unchanged.
- Browser console: zero warnings and zero errors.
- Automated: Vitest 49/49 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed. The repository-wide TypeScript check currently reports the unrelated existing `LegacyInvoice` status incompatibility in `src/services.ts:365`.
- Comparison history: the first computed-style pass found a line-height mismatch (`14.7px` versus `normal`). The explicit amount line height was removed; the second pass confirmed all requested typography properties match.

- No actionable P0/P1/P2 findings remain for this change.

- Required fidelity surfaces:
  - Fonts and typography: amount and contract title now use the same family, size, weight, and line height.
  - Spacing and layout rhythm: no table dimensions, padding, row spacing, or alignment changed.
  - Colors and visual tokens: the existing amount and title foreground colors remain within the same neutral text hierarchy.
  - Image quality and asset fidelity: no image or icon assets changed.
  - Copy and content: contract projects, amounts, statuses, and Invoice-linked data remain unchanged.

final result: passed

### Iteration 43: Invoice Issue Feedback Success Dialog

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-bf095370-135b-4460-bc6c-1f42ccefce78.png` (1515 x 783 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-feedback-success-desktop.png` (1265 x 712 px at 1x).
- Route and state: `http://localhost:4173/invoices/INV-260727-DEMO`, after submitting `Invoice 信息有误` with `付款信息有误` selected.
- Full-view evidence: the green page-level issue-feedback alert highlighted in the source is absent. A centered success dialog now confirms the selected issue type and keeps the Invoice workspace visible as subdued context.
- Focused evidence: the dialog is fully legible in the full-view capture, so a separate crop was unnecessary. Its title, confirmation copy, success icon, and `知道了` action follow the established profile-save dialog anatomy.
- Interaction: submitting closes the issue form and opens the success dialog; `知道了` closes it; signature and Invoice status-transition notices remain unchanged.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 48/48 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first browser-rendered comparison had no actionable P0/P1/P2 findings, so no visual-fix iteration was required.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the system's 18 px dialog heading and compact body hierarchy remain centered, readable, and consistent.
  - Spacing and layout rhythm: the established 360 px dialog width, 8 px radius, 10 px internal rhythm, and centered action are reused.
  - Colors and visual tokens: the existing neutral overlay, white surface, green success token, and black primary button are unchanged.
  - Image quality and asset fidelity: the PDF viewer and COMETS brand assets remain unchanged; the success state uses the existing Lucide icon treatment.
  - Copy and content: the dialog confirms the selected issue type and explains that staff will review and synchronize the result.

final result: passed

### Iteration 45: Payment-Stage Payout Validation Failure

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-af11fee2-7039-4f66-83f2-746f510cf9d2.png` (1536 x 746 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-failure-stage-desktop.png` (1265 x 712 px at 1x).
- Route and state: `http://localhost:4173/invoices/INV-260728-R`, authenticated, with an unresolved Airwallex bank-account validation failure.
- Full-view evidence: the reference layout, alert placement, document viewer, and processing card are preserved. The requested logic change intentionally replaces `审核退回` with `付款异常`, keeps `资料审核` completed, and moves the red blocked state to `完成付款`.
- Focused evidence: the alert and processing timeline remain readable in the full-view capture. The alert states that validation failed while Airwallex was initiating payment, and the final node reads `付款信息校验失败`.
- Interaction: `修改付款信息` opens the matching profile repair field; `重新发起付款` remains disabled until the value changes and Airwallex validation succeeds. The repair flow returns to waiting payment rather than repeating Invoice review.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 49/49 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change browser capture had no actionable P0/P1/P2 findings.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the existing compact alert, status, and timeline hierarchy remains unchanged and readable.
  - Spacing and layout rhythm: alert padding, document/sidebar proportions, node spacing, and action-stack rhythm match the established Invoice detail screen.
  - Colors and visual tokens: completed nodes retain the green success treatment; only the final payment node uses the existing red error treatment.
  - Image quality and asset fidelity: the supplied Invoice PDF render, COMETS mark, and Lucide icons remain sharp and unchanged.
  - Copy and content: every affected surface consistently uses payment-stage terminology: `付款异常`, `付款流程已暂停`, and `重新发起付款`.

final result: passed

### Iteration 46: One Project Per Invoice

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-8b4bd0be-da56-4545-93ec-bab5db7c0898.png` (1545 x 783 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-one-project-per-invoice-desktop.png` (1265 x 712 px at 1x).
- Route and state: `http://localhost:4173/invoices`, authenticated, all Invoice records visible.
- Full-view evidence: the six-column Invoice table, toolbar, row density, status pills, channel, amount, and actions retain the reference anatomy. Only the requested project ownership data changes.
- Focused evidence: all eight visible rows were read from the rendered DOM. They contain eight unique related-project names with no duplicates; `新品体验测评` and `夏季家居专题` replace the two previously duplicated project assignments.
- Cross-module evidence: the rendered request-project table contains eight rows and the contract table contains eight rows. Automated assertions confirm each Invoice maps to exactly one request project and one contract with the same project ID, project name, and brand.
- Interaction: fuzzy-searching `夏季家居专题` returns only `INV-240711-C`; clearing the query restores all eight records.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 50/50 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change browser capture had no actionable P0/P1/P2 findings.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: table labels, project titles, brand metadata, amounts, and status text retain the established hierarchy.
  - Spacing and layout rhythm: toolbar, six-column grid, row height, borders, and action spacing are unchanged.
  - Colors and visual tokens: existing COMETS surfaces, peach Invoice icons, semantic status pills, and neutral table borders are preserved.
  - Image quality and asset fidelity: the COMETS mark and existing Lucide icons remain sharp; no new visual asset was required.
  - Copy and content: each Invoice now displays a unique related project while all existing Invoice IDs, brands, amounts, channels, and statuses remain intact.

final result: passed

### Iteration 47: Invoice Status Navigation Order

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-973789b4-5863-4742-8203-be514bfc169d.png` (1474 x 745 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-status-tab-order-desktop.png` (1265 x 712 px at 1x).
- Route and state: `http://localhost:4173/invoices`, authenticated, `全部` selected.
- Full-view evidence: the Invoice toolbar, six-column table, filters, row density, and all visual tokens remain unchanged. The only requested difference is the status-navigation order.
- Focused evidence: the rendered tabs read `全部 → 待签署 → 待审核 → 已通过审核 → 付款异常 → 已打款`, placing the successful review state before the payment-stage exception.
- Interaction: `已通过审核` and `付款异常` each return their single matching Invoice; returning to `全部` restores all records.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 50/50 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change browser capture had no actionable P0/P1/P2 findings.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: tab labels and count badges retain their existing compact hierarchy.
  - Spacing and layout rhythm: tab gaps, underline, toolbar alignment, and table positioning are unchanged.
  - Colors and visual tokens: active underline, neutral count badges, and semantic row statuses remain unchanged.
  - Image quality and asset fidelity: the COMETS mark and existing icons remain sharp; no asset change was required.
  - Copy and content: only the requested ordering changed; labels, counts, filters, and Invoice data remain intact.

final result: passed

### Iteration 48: Two-State Contract Lifecycle And Exact Invoice Mapping

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-77670af0-9ac5-4505-9cad-b19463a3f110.png` (1459 x 752 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/contracts-two-status-desktop.png` (1444 x 744 px at 1x browser capture).
- Responsive evidence: `/Users/aria/Documents/支付系统c端/qa/contracts-two-status-mobile.png` (375 x 2333 px full-page capture from a 390 x 844 CSS viewport).
- Detail evidence: `/Users/aria/Documents/支付系统c端/qa/contracts-two-status-detail-desktop.png` (1444 x 744 px at 1x).
- Combined comparison: `/Users/aria/Documents/支付系统c端/qa/contracts-two-status-comparison.png` (2905 x 752 px); source and implementation are placed side by side at their native 1x density.
- Route and state: `http://localhost:4173/contracts`, authenticated, all eight creator contracts visible.
- Full-view evidence: the reference contract-list anatomy, summary metrics, toolbar, compact table, semantic badges, and action links remain intact. The requested product change intentionally replaces the reference's three statuses with only `请款中` and `已付款`.
- Focused evidence: the full-view comparison keeps the table copy legible, so a separate focused crop was unnecessary. The implementation shows two summary cards, three tabs (`全部`, `请款中`, `已付款`), seven `请款中` rows, and one `已付款` row.
- Mapping evidence: automated assertions require eight unique Invoice project names and IDs, eight request projects, and eight contracts. Every contract matches exactly one Invoice by `projectName`, with the same `projectId` and brand.
- Interaction: the `请款中` filter returns seven rows; the `已付款` filter returns only `日本市场测评`; returning to `全部` restores all eight rows. Representative detail pages render the two-step lifecycle as `请款中 → 已付款`.
- Responsive behavior: at 390 x 844 CSS px the desktop table is hidden, all eight mobile rows are visible, both summary cards remain readable, and the document has no horizontal overflow.
- Browser console: a fresh browser tab reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 50/50 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change comparison found no actionable P0/P1/P2 visual mismatch. The status-card count and table statuses differ from the reference by explicit product requirement.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: existing COMETS title, compact table, amount, metadata, and badge hierarchy remain unchanged.
  - Spacing and layout rhythm: the summary grid reflows cleanly from three reference cards to two equal cards; toolbar, columns, rows, borders, and mobile spacing retain the established system.
  - Colors and visual tokens: the existing yellow request-state and green paid-state treatments remain consistent and readable.
  - Image quality and asset fidelity: the COMETS mark and Lucide interface icons remain sharp; no new raster asset was required.
  - Copy and content: every contract-facing status now uses only `请款中` or `已付款`, while all eight project names match the Invoice module one-to-one.

final result: passed

### Iteration 50: Shared Invoice Prototype Notice

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-b89a025c-63f4-4258-97af-5341db21f506.png`.
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-shared-file-prototype-notice-desktop.png`.
- Route and state: `http://localhost:4173/invoices/INV-260727-S`, authenticated, awaiting-signature Invoice.
- Full-view evidence: a compact light-purple information banner appears directly below the Invoice heading without changing the existing document viewer, signing reminder, processing card, or action hierarchy.
- Cross-state evidence: the same notice is rendered on the payment-failure detail route `INV-260728-R`, confirming that it applies to every Invoice detail rather than only the signing state.
- Copy and product logic: the notice explicitly identifies the current shared file as prototype-only and not a payment document, then explains that production will display the project-specific Invoice uploaded from the management console for creator review, signature, and download.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 51/51 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change browser capture had no actionable P0/P1/P2 findings.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: compact notice copy remains subordinate to the Invoice title and primary workflow alerts.
  - Spacing and layout rhythm: the banner aligns with the full content width and preserves the existing page-stack spacing.
  - Colors and visual tokens: the pale lilac surface and purple information icon distinguish prototype context from warning, success, and payment-error states.
  - Image quality and asset fidelity: the supplied Invoice PDF, COMETS mark, and Lucide information icon remain sharp.
  - Copy and content: the notice clearly separates current prototype behavior from the future project-specific management-console upload flow.

final result: passed

### Iteration 51: Shared Contract Prototype Notice

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-46c48b18-c1d2-428a-8b50-f73b2af7f2a5.png` (1462 x 199 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/contract-source-notice-desktop.png` (1447 x 736 px from a 1462 x 744 CSS viewport at 1x).
- Focused combined comparison: `/Users/aria/Documents/支付系统c端/qa/contract-source-notice-comparison.png` (2823 x 228 px); the marked source and the matching title-to-status implementation region are placed side by side at a common 228 px height.
- Responsive evidence: `/Users/aria/Documents/支付系统c端/qa/contract-source-notice-mobile.png` (375 x 812 px from a 390 x 844 CSS viewport at 1x).
- Route and state: `http://localhost:4173/contracts/CON-260724-KOL-01`, authenticated, `请款中`.
- Full-view evidence: a full-width light-purple information notice appears exactly between the contract heading and status board without changing the existing status facts, lifecycle, document viewer, or creator-obligation layout.
- Focused evidence: the notice aligns with the status board edges, uses the system's existing purple information-icon anatomy, and keeps its title and explanatory copy readable as one compact row on desktop.
- Product copy: the notice states that the prototype reuses one demonstration contract across the system, production will synchronize the actual project-linked contract uploaded from the management console, creators will be able to view, download, and verify it here, and the demonstration file is not a basis for fulfillment or payment requests.
- Responsive behavior: at 390 x 844 CSS px the notice wraps to 82.67 px high, remains between the heading and status board, and introduces no horizontal overflow or overlap.
- Browser console: zero warnings and zero errors on both desktop and mobile verification states.
- Automated verification: TypeScript passed; Vitest 51/51 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change comparison found no actionable P0/P1/P2 mismatch.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the compact title and body hierarchy remains subordinate to the contract name and status board while staying readable at both breakpoints.
  - Spacing and layout rhythm: the notice fills the marked slot, aligns to the content grid, and preserves the existing page-stack spacing.
  - Colors and visual tokens: the pale lilac surface and purple information icon communicate prototype context without competing with blue contract-status badges.
  - Image quality and asset fidelity: the COMETS mark, contract PDF, and Lucide information icon remain unchanged and sharp.
  - Copy and content: the notice clearly separates prototype-wide shared-file behavior from the future project-specific management-console contract flow and adds an explicit non-reliance statement.

final result: passed

### Iteration 52: Invoice-Driven Linked Request Projects

- Logic source: current-account contracts and Invoices; records are associated only when their Unicode-normalized, trimmed, whitespace-collapsed project names match.
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/request-linked-projects-invoice-status-desktop.png` (1440 x 900 px viewport capture).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/request-linked-projects-invoice-status-mobile-320.png` (320 x 800 px viewport capture).
- State: local test environment only, authenticated as Léa Martin on `/`; the user environment was not updated.
- Data verification: all eight current contracts match exactly one Invoice and produce eight request projects. Removing one contract in an automated test removes its Invoice project from the request result.
- Status verification: request filters and badges are derived from Invoice status as `待签署`, `审核中`, `待付款`, `付款异常`, and `已完成`; PM and finance request states no longer exist in the data model, mock data, list, or detail UI.
- Progress verification: the detail timeline is `合同匹配 → Invoice 签署 → Invoice 审核 → 完成付款`. Payment failure blocks only the final node and explicitly avoids repeated Invoice review.
- Summary verification: totals group projects by Invoice stage and display EUR and USD separately when a stage contains multiple currencies.
- Interaction: the `待签署` filter returns two linked projects; returning to `全部` restores eight. Representative pending-signature and payment-failure detail pages display the correct Invoice-driven state.
- Responsive behavior: desktop has no horizontal document overflow at 1440 px; mobile shows eight stacked project cards, hides the desktop table, and keeps document width at 320 px.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 53: Payment Action Color Differentiation

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-d09140e4-708f-40f0-8736-9df2b442c065.png` (369 x 354 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-action-colors-desktop.png` (1265 x 712 px from a 1280 x 720 CSS viewport at 1x).
- Focused side-by-side comparison: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-action-colors-comparison.png` (725 x 385 px). The implementation crop is 332 x 355 px and is compared at native 1x density against the 369 x 354 px source crop.
- Route and state: `http://localhost:4173/invoices/INV-260728-R`, authenticated, payment failed, payout issue unresolved.
- Full-view evidence: the Invoice document, processing timeline, repair reminder, action order, card anatomy, and responsive workspace remain unchanged. The document-toolbar `下载PDF` control retains its original compact purple treatment because the new blue action style is scoped only to the processing card.
- Focused evidence: the three equal-width processing actions are visually distinct by meaning: brand purple for `修改付款信息`, muted green for the disabled `重新发起付款`, and light blue for `下载 Invoice`.
- Interaction: `修改付款信息` remains enabled and routes to `/profile?repairInvoice=INV-260728-R&field=account_number#payout-information`; `重新发起付款` remains disabled until payout validation succeeds; browser Back returns to the same Invoice.
- Browser console: a fresh page load reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change comparison found no actionable P0/P1/P2 mismatch. A final code-scope check separated the processing-card download class from the existing toolbar-download class; the revised browser view preserves both intended styles.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: button labels retain the established 13px bold hierarchy with unchanged icon sizing and alignment.
  - Spacing and layout rhythm: all processing actions remain 42px high, full width, and separated by the existing 10px grid gap.
  - Colors and visual tokens: purple communicates the primary repair task, green identifies payment retry readiness, and blue identifies the document download action; the disabled retry state remains recognizable without appearing actionable.
  - Image quality and asset fidelity: the supplied Invoice PDF, COMETS mark, and existing Lucide action icons remain sharp and unchanged.
- Copy and content: action labels, ordering, disabled guidance, and destination logic are unchanged.

final result: passed

### Iteration 54: Contract Actions Match Invoice Interaction

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-26919d9e-e29f-44ab-bb09-af9998385e2c.png` (1448 x 598 px at 1x), with the legacy text-only contract action column marked.
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/contract-invoice-action-pattern-desktop.png` (1433 x 752 px from a 1448 x 760 CSS viewport at 1x).
- Invoice reference capture: `/Users/aria/Documents/支付系统c端/qa/invoice-action-pattern-reference-desktop.png` (1433 x 752 px at the same viewport and density).
- Full-view comparison: `/Users/aria/Documents/支付系统c端/qa/contract-action-full-comparison.png` (2590 x 598 px); the source and final contract list are placed side by side at a common height.
- Focused comparison: `/Users/aria/Documents/支付系统c端/qa/contract-action-focused-comparison.png` (336 x 500 px); the legacy text action, final contract icon pair, and Invoice icon pair are shown side by side.
- Responsive evidence: `/Users/aria/Documents/支付系统c端/qa/contract-invoice-action-pattern-mobile.png` (375 x 812 px from a 390 x 844 CSS viewport at 1x).
- Route and state: `http://localhost:4173/contracts`, authenticated, all eight contracts visible.
- Full-view evidence: the contract table hierarchy, data, filters, status badges, and row density remain unchanged. Only the operation column changes from an underlined `查看合同` link to the Invoice module's independent view and download icon controls.
- Focused evidence: contract and Invoice controls both measure 34 x 32 px with a 6 px radius, use the same neutral foreground and light-purple hover treatment, and expose icon-only labels through `title` attributes.
- Interaction: clicking the first contract's view icon navigated to `/contracts/CON-260724-KOL-01`; clicking its download icon triggered a PDF download event for the contract document.
- Responsive behavior: mobile renders eight semantic `article` cards with eight view and eight download controls. Cards are no longer one large link, both actions remain explicit, and the page has no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change comparison found no actionable P0/P1/P2 mismatch.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: icon actions intentionally hide visible labels, matching Invoice while retaining descriptive tooltips.
  - Spacing and layout rhythm: two compact controls fit the existing operation column without changing table widths or row heights.
  - Colors and visual tokens: contract actions reuse the Invoice neutral and light-purple interaction tokens exactly.
  - Image quality and asset fidelity: the existing Lucide Eye and FileDown icons remain sharp and consistent across both modules.
  - Copy and content: all contract data remains unchanged; operation semantics are now explicitly `查看` and `下载`.

final result: passed

### Iteration 55: Branded Request Action Panel And Pending-Signature Routing

- Source callout: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-ee116367-dd7e-44a7-989d-0cb91712da06.png` (1778 x 888 px at 1x).
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/request-action-panel-branded.png` (1440 x 900 px viewport capture).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/request-action-panel-branded-mobile-320.png` (320 x 800 px viewport capture).
- Focused comparison: `/Users/aria/Documents/支付系统c端/qa/request-action-panel-comparison.png`, pairing the marked source area with the final branded panel.
- Destination evidence: `/Users/aria/Documents/支付系统c端/qa/request-go-sign-invoice-filter.png`, showing the Invoice list after the homepage action.
- State: local test environment only; the user environment was not updated.
- Visual change: the task band now uses a pale purple COMETS surface, purple border, 4 px left brand accent, and restrained purple shadow. The amount-summary cards below remain white, creating a clear functional hierarchy without changing the reference anatomy.
- Interaction: `去签署` routes to `/invoices?status=DRAFT_SIGNATURE`; the Invoice list reads the query, activates `待签署`, and renders only the two current pending-signature records.
- Responsive behavior: the branded band retains its two-row mobile arrangement at 320 px with no document overflow.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 56: Logo-Aligned Coral Payment Repair Action

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-a7a07d5d-f055-4924-904b-1911b692a543.png` (427 x 319 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-edit-coral-desktop.png` (1265 x 712 px from a 1280 x 720 CSS viewport at 1x).
- Focused side-by-side comparison: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-edit-coral-comparison.png` (783 x 370 px); the source crop and final action-card crop are shown together at native 1x density.
- Route and state: `http://localhost:4173/invoices/INV-260728-R`, authenticated, payment failed, payout issue unresolved.
- Full-view evidence: only the `修改付款信息` treatment changed. The Invoice document, timeline, reminder, button anatomy, green disabled retry state, blue download state, and 10px action spacing remain unchanged.
- Focused evidence: the former purple fill is replaced with `#c95852`, a deep coral sampled to align with the warm half of the COMETS mark. White text and the edit icon remain crisp, while hover uses the darker `#b64c47`.
- Interaction: `修改付款信息` remains enabled and routes to `/profile?repairInvoice=INV-260728-R&field=account_number#payout-information`; `重新发起付款` remains disabled before payout validation; browser Back returns to the same Invoice.
- Browser console: a fresh page load reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change comparison found no actionable P0/P1/P2 mismatch. The difference from the source purple button is intentional and directly implements the requested Logo-aligned warm-color direction.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the established 13px bold label, white foreground, icon size, and alignment remain unchanged.
  - Spacing and layout rhythm: the button remains 42px high, full width, and aligned with the retry and download actions.
  - Colors and visual tokens: deep coral now connects the primary repair action to the COMETS mark without competing with green retry and blue download semantics.
  - Image quality and asset fidelity: the COMETS mark, Invoice PDF, and existing Lucide action icons remain sharp and unchanged.
  - Copy and content: action labels, ordering, disabled guidance, and destination logic are unchanged.

final result: passed

### Iteration 57: Light Coral Payment Repair Action

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-a7a07d5d-f055-4924-904b-1911b692a543.png` (427 x 319 px at 1x).
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-edit-light-coral-desktop.png` (1265 x 712 px from a 1280 x 720 CSS viewport at 1x).
- Focused side-by-side comparison: `/Users/aria/Documents/支付系统c端/qa/invoice-payment-edit-light-coral-comparison.png` (783 x 370 px); the source crop and final action-card crop are shown together at native 1x density.
- Route and state: `http://localhost:4173/invoices/INV-260728-R`, authenticated, payment failed, payout issue unresolved.
- Full-view evidence: only the primary repair action palette changed. The Invoice document, timeline, information notice, card anatomy, green retry treatment, blue download treatment, dimensions, and spacing remain unchanged.
- Focused evidence: `修改付款信息` now uses a light coral surface (`#fff3f1`), soft coral border (`#efb8b2`), and darker coral foreground (`#b24f48`). Hover deepens the surface and border without becoming a solid button.
- Interaction: `修改付款信息` remains enabled and routes to `/profile?repairInvoice=INV-260728-R&field=account_number#payout-information`; `重新发起付款` remains disabled before payout validation; browser Back returns to the same Invoice.
- Browser console: a fresh page load reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build passed; Sites worker tests 4/4 passed.
- Comparison history: the first post-change comparison found no actionable P0/P1/P2 mismatch. The lighter palette intentionally supersedes the solid coral treatment from Iteration 56.

- No actionable P0/P1/P2 findings remain.

- Required fidelity surfaces:
  - Fonts and typography: the established 13px bold label, icon size, and alignment remain unchanged.
  - Spacing and layout rhythm: the button remains 42px high, full width, and aligned with the retry and download actions.
  - Colors and visual tokens: the pale coral surface connects to the COMETS mark while maintaining clear separation from the pale green retry and pale blue download actions.
  - Image quality and asset fidelity: the COMETS mark, Invoice PDF, and existing Lucide action icons remain sharp and unchanged.
  - Copy and content: action labels, ordering, disabled guidance, and destination logic are unchanged.

final result: passed

### Iteration 58: Distinct Request Homepage Card Surfaces

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-4106fb53-2625-43a1-8f97-9904e24ac7c0.png` (1473 x 370 px at 1x), with both homepage cards marked for color treatment.
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/request-dual-card-colors-desktop.png` (1440 x 900 px viewport capture).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/request-dual-card-colors-mobile-320.png` (320 x 780 px viewport capture).
- Combined comparison: `/Users/aria/Documents/支付系统c端/qa/request-dual-card-colors-comparison.png`, placing the supplied reference and final desktop implementation in one visual artifact.
- State: local test environment only; the user environment was not updated.
- Visual change: the `待我处理` card uses `#faf7fd` with a 4px `#a66bd4` left accent. The amount-summary card uses `#f5f9fd` with a 4px `#4b88c8` left accent and blue-gray internal dividers, creating a clear functional distinction while preserving the selected layout.
- Responsive behavior: the two colored surfaces and their accents remain visible at 320 px. The page, document, and body widths all remain 320 px with no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 53/53 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 59: Unified White Request Homepage Cards

- Current design direction: the user's latest instruction explicitly supersedes Iteration 58's colored-card treatment. The `待我处理`, amount-summary, and request-project cards must all use the same white surface.
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/request-all-white-cards-desktop.png` (1280 x 720 px viewport capture).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/request-all-white-cards-mobile-320.png` (320 x 780 px viewport capture).
- State: local test environment only; the user environment was not updated.
- Visual change: all three cards use `#fff`, the same neutral `rgba(235, 237, 242, 0.95)` border, and the shared restrained card shadow. Purple and blue-gray card backgrounds and both 4px colored left accents were removed.
- Preserved semantics: action icons, links, amount-state dots, status badges, and request progress retain their existing semantic colors.
- Responsive behavior: all three surfaces remain white at 320 px; the page, document, and body widths remain 320 px with no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated verification: Vitest 53/53 passed; Vite production build passed; Sites packaging passed; Sites worker tests 4/4 passed.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 60: Composite Registration Password

- Source visual truth: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-9a0ef674-4400-4927-ad43-4f0e13245273.png` (545 x 132 px at 1x), with the user's accompanying text superseding the screenshot's former special-character requirement.
- Browser-rendered implementation: `/Users/aria/Documents/支付系统c端/qa/register-password-mobile-full.png` (530 x 583 px browser-content capture from a 545 x 600 viewport override).
- Focused implementation: `/Users/aria/Documents/支付系统c端/qa/register-password-block.png`.
- Side-by-side focused comparison: `/Users/aria/Documents/支付系统c端/qa/register-password-side-by-side.png` (1102 x 132 px).
- Route and state: isolated unauthenticated local test state on `/register`; the user environment was not updated.
- Copy and validation: the field states `8–20 位复合密码` and explains that uppercase letters, lowercase letters, and numbers are all required without spaces. Special characters remain allowed but are not required.
- Interaction: `creator2026` was blocked with `密码须同时包含大写字母、小写字母和数字`; `Creator2026` passed and advanced to social-account verification.
- Responsive behavior: the password label, 44 px input, visibility action, and complete helper text remain visible without overlap or horizontal overflow at the narrow test viewport.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 59/59 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Comparison history: the first focused comparison found no actionable P0/P1/P2 mismatch. The helper copy intentionally differs from the screenshot because the user's latest instruction removes the special-character requirement.

- Required fidelity surfaces:
  - Fonts and typography: the existing bilingual 11 px field label and compact helper hierarchy remain unchanged and readable.
  - Spacing and layout rhythm: the password field preserves the existing input height, radius, icon placement, and seven-pixel label/control gap.
  - Colors and visual tokens: neutral field border, dark label, muted helper copy, and COMETS coral required marker remain unchanged.
  - Image quality and asset fidelity: the supplied COMETS mark and existing library visibility icon remain sharp and unchanged.
  - Copy and content: the visible rule and validation behavior now match the final uppercase, lowercase, and numeric requirement exactly.

final result: passed

### Iteration 61: Desktop, 24/27-inch, and iPad Responsive Coverage

- Design source: the existing creator-facing COMETS operational UI remains the visual source of truth; this iteration changes responsive behavior only and preserves the established cards, typography, color tokens, status semantics, and information hierarchy.
- Target viewports: `1366×768`, `1440×900`, `1920×1080`, `2560×1440`, `768×1024`, and `1024×768`.
- PC evidence: `/Users/aria/Documents/支付系统c端/qa/responsive-home-1366x768.png` and `/Users/aria/Documents/支付系统c端/qa/responsive-contracts-1440x900.png`.
- Large-display evidence: `/Users/aria/Documents/支付系统c端/qa/responsive-home-1920x1080-full.png`, plus the left/right 27-inch captures `/Users/aria/Documents/支付系统c端/qa/responsive-invoices-2560x1440-left.png` and `/Users/aria/Documents/支付系统c端/qa/responsive-invoices-2560x1440-right.png`.
- iPad landscape evidence: `/Users/aria/Documents/支付系统c端/qa/responsive-home-1024x768.png`, `/Users/aria/Documents/支付系统c端/qa/responsive-contract-detail-1024x768.png`, `/Users/aria/Documents/支付系统c端/qa/responsive-invoice-detail-1024x768.png`, and `/Users/aria/Documents/支付系统c端/qa/responsive-register-1024x768.png`.
- iPad portrait evidence: `/Users/aria/Documents/支付系统c端/qa/responsive-home-768x1024-v2.png`, `/Users/aria/Documents/支付系统c端/qa/responsive-profile-768x1024.png`, `/Users/aria/Documents/支付系统c端/qa/responsive-register-768x1024.png`, `/Users/aria/Documents/支付系统c端/qa/responsive-social-onboarding-768x1024.png`, and `/Users/aria/Documents/支付系统c端/qa/responsive-onboarding-profile-768x1024.png`.
- Large-screen behavior: the former `1280px` reverse cap is removed. The authenticated workspace expands to `1600px` on 24-inch-class viewports and `1800px` on 27-inch-class viewports while retaining stable type sizes.
- Tablet behavior: `1100px` and below uses the drawer navigation, full-width content area, touch-friendly request/contract lists, stacked Invoice tooling, and single-column document workspaces. Registration and general authentication switch to a single-column composition at `900px` and below.
- PC behavior: `1366px` and `1440px` keep the fixed sidebar and desktop tables. The request table now fits the available `1366px` content width without internal or page-level horizontal overflow.
- Portrait refinement: the three request amount summaries use two columns at iPad portrait widths, with the final summary spanning the row; the multi-currency amount remains fully visible.
- Measured overflow: every tested authenticated route reported `documentElement.scrollWidth === documentElement.clientWidth`. The drawer, table/list visibility, main-content margin, and content caps matched the intended breakpoint at each target size.
- Interaction: the iPad drawer opened to `286px`, displayed its scrim, settled at transform `0`, and closed back off-canvas. Registration advanced through social verification to the payment-information step on the isolated local QA origin.
- Browser console: zero warnings and zero errors across authenticated, registration, and onboarding checks.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

- No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 62: Invoice-Derived Three-State Contract Lifecycle

- Source reference: `/var/folders/rf/2q5dyfp52bl2053nt7fy31yr0000gn/T/codex-clipboard-bfe2e027-9692-4cc7-86ed-f65abd12aa72.png` (1575 x 622 px).
- Desktop implementation: `/Users/aria/Documents/支付系统c端/qa/contract-three-status-desktop.png` (1265 x 712 px).
- Mobile implementation: `/Users/aria/Documents/支付系统c端/qa/contract-three-status-mobile.png` (375 x 812 px).
- Detail lifecycle evidence: `/Users/aria/Documents/支付系统c端/qa/contract-three-status-detail-unclaimed.png` (1560 x 761 px).
- Side-by-side comparison: `/Users/aria/Documents/支付系统c端/qa/contract-three-status-comparison.png` (2842 x 712 px).
- Status model: contracts now use only `未请款`, `请款中`, and `已付款`. Status is derived from the exact one-to-one linked Invoice: `DRAFT_SIGNATURE` maps to `未请款`; `PENDING_REVIEW`, `APPROVED`, and `PAYMENT_FAILED` map to `请款中`; `PAID` maps to `已付款`.
- Seeded result: eight project-matched contracts resolve to `未请款 3 / 请款中 4 / 已付款 1`. Exact `projectId`, project name, and brand checks prevent unrelated Invoice records from affecting a contract.
- List behavior: the three overview metrics, status badges, and `全部 / 未请款 / 请款中 / 已付款` filters share the same derived state and were verified on desktop and mobile.
- Detail behavior: the lifecycle board is consistently ordered `未请款 → 请款中 → 已付款`; completed, current, and pending nodes were verified for all three states.
- Responsive behavior: desktop retains the dense operational table and three-column overview. Mobile renders eight touch-friendly contract cards without horizontal overflow.
- Browser console: fresh desktop and mobile sessions reported zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 60/60 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.
- Visual assessment: hierarchy, density, typography, status colors, table anatomy, and action placement remain consistent with the established COMETS creator portal. No actionable P0/P1/P2 findings remain.

final result: passed

### Iteration 63: Invoice-Existence Request Project Gating

- Current business rule: the user's latest instruction supersedes Iteration 62's `DRAFT_SIGNATURE → 未请款` mapping. Contracts exist first; a contract with no matching Invoice is `未请款` and remains exclusive to the contract module.
- Desktop homepage evidence: `/Users/aria/Documents/支付系统c端/qa/request-invoice-existence-logic-desktop.png`.
- Mobile homepage evidence: `/Users/aria/Documents/支付系统c端/qa/request-invoice-existence-logic-mobile-320.png` (320 x 780 px).
- Data result: eight contracts remain available in the contract module. Three have no Invoice and stay `未请款`; five have a one-to-one Invoice and request project, producing four `请款中` contracts and one `已付款` contract.
- Request behavior: the homepage now displays five projects, all backed by an exact project-name Invoice match. The three unrequested contracts are absent from the request table, amount summaries, pending actions, filters, and request detail links.
- Invoice behavior: the Invoice list contains five records with one each in `待签署`, `待审核`, `已通过审核`, `付款异常`, and `已打款`. The pending-signature record is linked to `夏季家居专题`; no Invoice exists for the three `未请款` contracts.
- Contract behavior: the overview reports `未请款 3 / 请款中 4 / 已付款 1`. `DRAFT_SIGNATURE`, `PENDING_REVIEW`, `APPROVED`, and `PAYMENT_FAILED` all map to `请款中`; only the absence of an Invoice maps to `未请款`.
- Responsive behavior: the 320 px homepage renders five project cards and has no horizontal overflow.
- Browser console: zero warnings and zero errors.
- Automated verification: TypeScript passed; Vitest 61/61 passed; Vite production build and Sites packaging passed; Sites worker tests 4/4 passed.
- Environment: local test environment only. The user Mac at `192.168.88.188:8772` was not updated.

- No actionable P0/P1/P2 findings remain.

final result: passed
