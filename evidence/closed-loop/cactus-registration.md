# Cactus Governor registration/indexing path — current product

Date checked: 2026-09-15.

## The decisive finding

The live product's DAO-registration entry point (`www.tally.xyz/add-a-dao`, which redirects to `www.tally.xyz/get-started`) was fetched directly in this session (`curl`, `HTTP_STATUS:200`). Its raw HTML contains, verbatim:

> "DAO submissions are paused right now."
> "If you need help adding a DAO, contact support and we'll route your request."

This was independently re-verified by grepping the raw downloaded HTML for the exact sentence (not taken from a summarized fetch alone) — see the command output captured in this session.

**Classification: `BLOCKED` (product-level, current, not a credential gap).** This is not "we lack an API key" (that pattern is `BLOCKED_CACTUS_CREDENTIAL`, already used correctly in Gate 1A for the GraphQL API) — this is the product itself stating the self-serve feature is currently disabled for everyone, regardless of credentials.

## What the (now-archived) self-serve flow used to look like

Historical/legacy documentation (`docs.tally.xyz`, pre-pause, via the original Tally-era newsletter and docs) describes:

1. "Select the Get Started button on the Tally homepage, select Deploy myself, then select Deploy contracts yourself."
2. "Enter your organization's info: its name, description, and Governor Contract details. Then select Add Governor."
3. Framed as self-serve, "single-digit minutes."

This confirms the *mechanism* existed and was, at some point, permissionless/UI-driven. It does not confirm the mechanism still works today — and the live page contradicts that it currently does.

## "Contact support" path

The paused-flow page offers a manual, human-mediated alternative: "contact support and we'll route your request." This is explicitly the kind of dependency Gate 1C instructions §36 describes as a legitimate block condition ("A controlled testnet DAO registration must be manually approved... Required current product behavior cannot be observed without user interaction"). This gate does not treat that path as available to it — it requires a real person (the user) to initiate contact and an unknown, externally-controlled response time, which this gate cannot manufacture or wait for. See `classification.md` for how this is weighed.

## Legacy open-source tooling — classified separately

`github.com/withtally/gov_deployer` — fetched and read in this session. Its own README states it is "a tool to deploy governance and related contracts supported by Tally via CLI," covering OpenZeppelin Governor, Compound Alpha, and Compound Bravo deployment. Critically:

- **It deploys contracts. It does not register or index them with Cactus.** Registration/indexing is a separate step — the one that is currently paused.
- **It is itself deprecated**: the README states "This REPO is the old version of the deployer, to use the newer one, please go to github.com/withtally/gov-deployer" (a different, newer repository, not examined in this gate — out of scope given the registration step is blocked regardless of which deployer tool produces the contract).

**Classification: `LEGACY/OPEN-SOURCE TOOLING`, kept explicitly separate from `CURRENT CACTUS PRODUCT SUPPORT`, per Gate 1C instructions §8.** The existence of a contract-deployment script does not prove Cactus will index the result — and per the finding above, indexing is the part that is currently blocked, not deployment.

## Conclusion

Current Cactus Governor registration is `BLOCKED` for autonomous/self-serve use. The only available path is human-mediated support contact, which is outside this gate's authority to initiate or wait on.
