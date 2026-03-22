# Funding Linking Between Budget Movements and Seats PRD

## 1. Overview

### Product Name
Funding Linking Between Budget Movements and Seats

### Objective
Make `funding` the consistent planning key that links budget movements to seat allocation across the app, so finance users can track how budget allocations map to seats, manage corrections during the year, and import or export the data reliably.

### Problem Statement
The application already stores `funding` on budget areas and tracker seats, and roster imports already contain a `fundingType` source column. However:
- budget movements do not yet carry the seat-linking funding value needed for direct allocation tracking
- seat creation and editing does not expose funding as a maintained year-specific selectable value
- roster users cannot easily see funding in the roster list
- budget movement corrections over time are only visible as raw rows, without a current net funding view
- budget movement import and export do not yet treat funding as a first-class planning column

### V1 Solution
Use `funding` as the single user-facing and persisted linkage key between budget movements and seats.

V1 must:
- reuse existing Next.js, Prisma, and server-side query patterns
- keep historical budget movement rows append-only
- support year-scoped maintained funding values
- auto-add unknown imported funding values for the selected year
- expose funding in seat creation, seat editing, roster review, budget movement maintenance, and CSV import/export
- keep all logic server-side

No separate new `fundingType` field is introduced for the app domain model.

---

## 2. Goals & Non-Goals

### Goals
- Use `funding` consistently as the seat-to-budget linkage key.
- Let users select year-specific funding values when creating or editing seats.
- Let users assign funding to manual and imported budget movements.
- Show funding in the People Roster experience.
- Add a tracker funding follow-up page that shows allocated, used, projected, and remaining funding by funding value.
- Preserve budget movement history while also showing the current net position per funding.
- Make funding importable and exportable in budget movement CSV workflows.
- Show advisory funding availability in the add/edit seat dialog based on the selected funding and projected seat cost.
- Reuse the existing maintained reference-value pattern for year-scoped selectable values.

### Non-Goals
- No separate app-level `fundingType` domain field.
- No replacement of historical budget movement rows with a mutable latest-only model.
- No browser-side business logic for funding derivation or persistence.
- No redesign of the tracker budgeting model beyond what is required to link funding to movements and seats.
- No change to access control beyond existing page and API authorization rules.

---

## 3. Target Users

### Primary Users
- Finance admins maintaining budget movements
- Finance members creating or correcting seats
- Users reviewing the People Roster and roster-derived seat allocations

### Secondary Users
- Admins maintaining year-specific selectable funding values
- Users exporting budget movement data for offline review or reconciliation

All usage must continue to respect the current viewer scope model.

---

## 4. Current Project Context

This project already contains the relevant data and UI surfaces needed for a repo-native funding-linking feature.

### Existing Models And Fields
- `BudgetArea.funding`
- `TrackerSeat.funding`
- `TrackerOverride.funding`
- `RosterPerson.fundingType`
- `BudgetMovement.givingFunding`

### Existing Relevant Flows
- Budget movement maintenance on `/budget-movements`
- Budget movement manual create/update/delete APIs
- Budget movement CSV import API
- People roster browsing on `/people-roster`
- Seat creation and editing in the seat editor dialog
- Admin-maintained seat reference values

### Important Current Constraint
`RosterPerson.fundingType` already exists as an import input field. In this feature, that roster input becomes the source that maps into the app’s effective `funding` value on seats. The user-facing app terminology should be `funding`, not `funding type`, except when referring to the existing roster import source column.

### Relevant Repo Files
Primary implementation will build on:
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/prisma/schema.prisma`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/prisma/schema.prisma)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/queries.ts`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/queries.ts)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/imports.ts`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/imports.ts)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/components/finance/seat-editor-dialog.tsx`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/components/finance/seat-editor-dialog.tsx)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/components/finance/people-roster-browser.tsx`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/components/finance/people-roster-browser.tsx)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/components/finance/budget-movements-browser.tsx`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/components/finance/budget-movements-browser.tsx)

---

## 5. Product Scope

### V1 Scope
Add funding linking across the existing seat and budget movement workflows for a selected year.

V1 includes:
- year-scoped maintained funding values
- funding selection in the add/edit seat dialog
- advisory funding follow-up feedback in the add/edit seat dialog based on projected seat cost
- funding display in the roster list
- funding on manual budget movement entry
- funding in budget movement CSV import
- budget movement CSV export including funding
- grouped funding summaries on the budget movements page showing the current net position by funding
- a tracker subpage for funding follow-up with funding-level overview and seat drilldown

### V1 Out Of Scope
- multi-year funding rollups
- automated reconciliation against external systems
- funding approval workflows
- background jobs or async processing dedicated to funding sync
- replacing the roster import source field name from `Funding type`

---

## 6. Core Use Cases

### Seat Funding Selection
User creates or edits a seat and selects one of the available funding values for the working year using a single-select typeahead.

### Roster Funding Review
User reviews the People Roster and can see each row’s effective funding value directly in the roster list.

### Budget Movement Funding Assignment
User creates or edits a manual budget movement and assigns the receiving-side funding value that should link the movement to seat allocation.

### Budget Correction Tracking
User reviews all budget movement rows across the year and also sees a grouped net summary by funding that reflects increases and decreases over time without deleting history.

### Budget Movement Import / Export
User imports a CSV with funding included as a column, or exports budget movements with funding for reconciliation or offline review.

### Funding Follow-Up In Tracker
User opens a tracker subpage to review how much funding is allocated from budget movements, how much has already been used by actuals on related seats, how much is projected for the remainder of the year, and which seats make up that position.

### Seat Funding Capacity Check
User selects funding, dates, and costing inputs in the add/edit seat dialog and immediately sees whether the selected funding still has room for the projected seat or is already exceeded.

---

## 7. Functional Requirements

### 7.1 Funding Is The App-Level Linkage Key
The application must use `funding` as the user-facing and persisted key that links seats and budget movements.

The implementation must state and enforce that:
- `funding` is the app term shown in UI
- no separate new app-domain `fundingType` field is introduced
- existing roster input `fundingType` is treated as a source value that maps into effective seat `funding`

### 7.2 Year-Scoped Maintained Funding Values
Funding values must be maintained per year using the existing maintained reference-value pattern.

The funding list must:
- be year-specific
- be selectable in seat and budget movement workflows
- allow admins to review and maintain values using existing admin patterns
- be automatically extended when imports or manual entry introduce a previously unknown funding value

### 7.3 Seat Create / Edit Experience
The add/edit seat dialog must:
- expose a single-select typeahead for funding
- show the selected funding value clearly in the trigger
- use the funding values available for the active year
- persist the value server-side on the seat profile

Manual seats and roster-backed seats with overrides must both support effective funding updates through existing seat profile APIs.

### 7.4 People Roster Experience
The roster page must:
- expose effective funding in the page data model
- show funding in the roster list table for both roster-derived and manual seats
- continue to use existing scope filtering and effective-seat logic

### 7.5 Budget Movement Maintenance
Budget movements must support a receiving-side funding value in addition to the existing `givingFunding`.

The budget movements page must:
- allow funding selection when creating or editing a movement
- support a year selector in the manual movement form
- allow inline creation of a new funding value if needed during manual entry
- persist the movement to the selected year

### 7.6 Budget Movement Corrections Handling
Budget movement rows must remain historical and append-only.

The app must not overwrite prior movement rows to represent corrections. Instead:
- users may add more rows during the year for increases or decreases
- the page must display row-level history
- the page must also display a grouped funding summary showing the current net position by funding

### 7.7 CSV Import / Export
Budget movement CSV import must:
- require or accept a funding column for the receiving-side funding value
- persist that value on imported budget movement rows
- auto-add unseen funding values for the selected year

Budget movement CSV export must:
- export row-level history
- include funding in the exported columns
- respect the selected year and any page-level filtering intended for export

### 7.8 Tracker Funding Follow-Up Page
The app must provide a tracker-scoped funding follow-up page under a sub-route of `/tracker`, recommended as `/tracker/funding-follow-up`.

The page must:
- inherit the selected year and current viewer scope restrictions used by tracker
- be linked from the tracker page rather than introduced as a new primary navigation item
- remain its own page rather than a panel embedded into the existing tracker workspace
- show funding-level follow-up rows for the selected year
- allow same-page drilldown into the related seats for a selected funding value

Each funding summary row must include:
- `Allocated Funding`: net budget movement amount for that funding in the selected year
- `Used Funding`: actuals recorded on seats whose effective `funding` matches that funding
- `Projected Funding`: current year-end forecast for those same seats using existing tracker forecast logic
- `Remaining / Overrun`: allocated funding minus projected funding
- `Seat Count`
- `Active Seat Count`
- latest movement date for context

The drilldown seat list must show:
- seat identity
- status
- funding
- actuals to date
- remaining forecast
- total projected spend
- start and end dates
- budget area context already used by tracker

### 7.9 Seat Dialog Funding Availability Feedback
The add/edit seat dialog must show funding follow-up feedback when a funding value is selected and the seat has enough pricing inputs to estimate cost.

The dialog feedback must:
- use the same pricing rules as tracker forecasts
- estimate projected seat cost from the current form state before save
- compare the selected funding’s current remaining capacity against the selected seat’s projected contribution
- show a remaining amount when the seat fits within funding
- show an exceeded amount when the seat would overrun funding
- remain advisory only and never block save or require confirmation
- fall back to a neutral “cannot estimate yet” state when pricing inputs are incomplete

The estimate must reuse current repo logic:
- external seats use `dailyRate`
- non-external seats use internal cost assumptions by band and location
- active months follow the same start and end date logic already used by tracker forecasts
- forecast overrides and seat-effective values remain the server-side source of truth where current tracker logic already depends on them

---

## 8. Data Model And Source Mapping

### Existing Fields Reused
- `BudgetArea.funding` remains the funding label already associated with budget areas
- `TrackerSeat.funding` remains the effective funding stored on seats
- `TrackerOverride.funding` remains the overrideable funding field for roster-backed seats
- `BudgetMovement.givingFunding` remains the source-side funding field for the giving side of a movement

### New / Adjusted Movement Representation
Budget movements must carry a receiving-side funding value that represents the funding bucket used to link seat allocation to the movement.

This may be implemented by:
- adding a dedicated receiving-side funding field on `BudgetMovement`, or
- repurposing the movement model in a clearly named way that keeps `givingFunding` distinct from the receiving-side funding link

The implementation must keep both concepts clear:
- `givingFunding` = where the movement came from
- receiving-side `funding` = the funding allocation that seats should link to

### Roster Import Mapping
`RosterPerson.fundingType` remains the imported source field.

For app behavior:
- imported roster `fundingType` should map into effective seat `funding`
- user-facing UI should show `funding`
- documentation and implementation should only mention `funding type` when referring to the legacy roster import source field

### Maintained Reference Values
Funding values must be stored using the same year-scoped maintained-value infrastructure already used for vendor, location, manager, role, band, and resource type.

Unknown imported values must be added automatically for the relevant year.

---

## 9. API And Interface Requirements

### Budget Movements Page
The budget movements page must support:
- funding in the movement list
- funding in the manual movement form
- a funding summary grouped by funding
- year selection for manual movement creation
- CSV export access

### People Roster Page
The People Roster page must support:
- effective funding in its server-side page data
- funding rendered in the roster list table

### Seat Editor Dialog
The seat dialog must support:
- funding as a searchable single-select typeahead
- existing server-side save flows for manual seats and roster-backed overrides
- advisory funding availability feedback for the selected funding and working year

### Tracker Funding Follow-Up Page
The tracker area must support:
- a subpage route at `/tracker/funding-follow-up`
- year-aware, scope-aware funding follow-up summary data
- same-page seat drilldown filtered by funding
- a link from the tracker page header or intro to the funding follow-up page
- reuse of existing effective-seat and forecast derivation logic rather than a separate funding calculation engine

### Admin Reference Values
Admin reference-value maintenance must support:
- a funding reference-value section for the selected year
- the same add, edit, delete, import, and export patterns already used for other maintained values if the repo keeps that behavior consistent across value types

### API Expectations
The implementation should extend existing repo-native endpoints rather than adding parallel APIs when current patterns already cover the use case.

Relevant endpoints include:
- budget movement create/update/delete APIs
- budget movement import API
- tracker seat create API
- tracker seat update API
- admin maintained reference-value APIs

The follow-up page contract must include:
- funding summary rows with allocated, used, projected, and remaining or overrun amounts
- latest movement date and seat counts per funding
- drilldown seat rows filtered by effective funding
- selected year and selected funding filter state

The seat-dialog contract must provide enough funding follow-up context for the selected funding and year to render remaining or exceeded messaging without relying on a client-only source of truth.

All persistence and import logic must remain server-side.

---

## 10. Import / Export Requirements

### Budget Movement Import
Budget movement CSV import must:
- read the funding column for the receiving-side funding value
- save funding onto imported rows
- preserve existing import replacement behavior for imported budget movement batches
- keep manual movement rows intact

### Budget Movement Export
Budget movement export must:
- generate CSV from the app
- include funding as an exported column
- include row-level movement history, not only grouped summaries
- be usable for finance reconciliation and audit review

### Roster Import Compatibility
Roster import must continue to accept the existing `Funding type` source column and map that source into effective app funding behavior.

---

## 11. Budget Movement Corrections Handling

Corrections during the year are expected and must be represented safely.

### Required Behavior
- Budget movement rows remain append-only.
- Users can add correction rows that increase or decrease prior allocations.
- The page must retain the full audit trail of all imported and manual movement rows.
- The page must also provide a grouped funding summary showing the current net amount by funding.

### Why This Approach
This preserves historical auditability while giving users an operational view of the current funding position.

The application must not force:
- destructive overwrites of prior movement rows
- a latest-row-wins interpretation
- a single-row-per-funding model

---

## 12. Acceptance Criteria

- A new PRD exists in `/docs` for the funding-linking feature.
- The PRD is repo-specific and aligned with the current Prisma, query, and UI model.
- The document consistently uses `funding` terminology instead of `funding type`, except when describing the existing roster import source field.
- The document explicitly states that no separate new `fundingType` field is introduced in the app domain model.
- The document explicitly states that funding values are year-scoped maintained reference values.
- The document explicitly states that unknown imported funding values are auto-added for the selected year.
- The document explicitly states that budget movements stay append-only and that grouped funding summaries provide the current net position.
- The document explicitly states that budget movement export includes row-level history with funding included.
- The document defines a tracker funding follow-up subpage at `/tracker/funding-follow-up` with funding-level overview and same-page seat drilldown.
- The document defines allocated, used, projected, and remaining or overrun funding metrics using existing seat actuals and forecast logic.
- The document defines add/edit seat dialog funding feedback as advisory only and based on the same seat costing rules already used by tracker forecasts.
- The PRD is decision-complete enough to hand off directly for implementation.

---

## 13. Implementation Notes

### Terminology
- Use `funding` in app UI, API payloads, page data types, and business logic.
- Use `funding type` only for the legacy roster import source field name when parsing or describing source input.

### Architecture
- Reuse existing Next.js app-router patterns.
- Reuse existing Prisma-backed server-side query and import helpers.
- Reuse existing maintained reference-value infrastructure rather than adding a one-off funding picker store.
- Reuse existing seat-editor searchable selection patterns for the funding input.
- Reuse existing tracker summary, effective-seat, actuals, and forecast derivation logic for funding follow-up calculations instead of building a parallel calculator.

### Data Safety
- Preserve auditability of budget movement history.
- Keep create, update, import, and export logic server-side.
- Do not expose any new privileged data beyond the existing scope model.

### Rollout Preference
Implement the feature as an extension of existing seat, tracker, roster, admin, and budget movement flows rather than as a separate workflow. This keeps user behavior aligned with the rest of the application and minimizes parallel patterns.
