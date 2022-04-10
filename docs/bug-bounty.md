# Bancor v3 Bug Bounty

## Overview
The Bancor 3 Bug Bounty program aims to incentivize responsible disclosures of any bugs in the Bancor 3 smart contracts. Starting with the official beta launch, the [contracts-v3](https://github.com/bancorprotocol/contracts-v3) repository is subject to the Bounty Program.

Rewards are allocated based on the severity of the bug disclosed and awarded up to USD 1 million. The scope, terms and rewards are at the sole discretion of Bprotocol Foundation.

All vulnerabilities disclosed prior to the official launch of Bancor 3 (scheduled for the middle of May 2022) will be eligible to receive higher rewards.

## Scope
The list below is not limited to the following submissions but it gives an overview of the issues we care about:
- Stealing or loss of funds
- Unauthorized transactions
- Transaction manipulation
- Price manipulation
- Fee payment bypass
- Balance manipulation
- Privacy violation
- Cryptographic flaws
- Reentrancy
- Logic errors (including user authentication errors)
- Solidity details not considered, including integer over-/under-flow, rounding errors, unhandled - exceptions)
- Trusting trust/dependency vulnerabilities, - including composability vulnerabilities)
- Oracle failure/manipulation
- Novel governance attacks and economic/financial - attacks, including flash loan attacks
- Congestion and scalability, including running out of gas, block stuffing, susceptibility to - frontrunning
- Consensus failures
- Cryptography problems, e.g., signature malleability, susceptibility to replay attacks, - weak randomness and weak encryption
- Susceptibility to block timestamp manipulation
- Missing access controls / unprotected internal or - debugging interfaces
- Issues arising from whitelisted tokens

## Out of Scope & Rules
The following are not within the scope of the Program:
- Bugs in any third party contract or platform that interacts with Bancor V3.
- Vulnerabilities already reported and/or discovered in contracts built by third parties on Bancor V3. We reserve the right to keep private previous bug disclosures.
- Any previously reported bugs.

The following vulnerabilities are excluded from the rewards for this bug bounty program:
- Attacks that the reporter has already exploited themselves, leading to damage.
- Attacks requiring access to leaked keys/credentials.
- Attacks requiring access to privileged addresses (governance, strategist)
- Incorrect data supplied by third party oracles (Note that oracle manipulation and flash loan attacks are included in the bounty)
- Basic economic governance attacks (e.g. 51% attack)
- Best practice critiques
- Sybil attacks
- Bugs in any third party contract or platform that interacts with the Bancor protocol (Note that oracle manipulation and flash loan attacks are included in the bounty)

The following activities are prohibited by bug bounty program:
- Any testing with mainnet or public testnet contracts; all testing should be done on private testnets or private mainnet forks
- Any testing with pricing oracles or third party smart contracts
- Attempting phishing or other social engineering attacks against contributors and/or customers
- Any testing with third party systems and applications (e.g. browser extensions) as well as websites (e.g. SSO providers, advertising networks)
- Any denial of service attacks
- Automated testing of services that generates significant amounts of traffic
- Public disclosure of an unpatched vulnerability in an embargoed bounty

## Disclosure
Any vulnerability or bug discovered must be reported via the following email: bugbounty@bancor.network

The vulnerability must not be disclosed publicly or to any other person, entity or email address before Bprotocol Foundation has been notified, has confirmed the issue is fixed, and has granted permission for public disclosure. In addition, disclosure must be made within 24 hours following discovery of the vulnerability.

A detailed report of a vulnerability increases the likelihood of a reward and may increase the reward amount. Please provide as much information about the vulnerability as possible, including:
- The conditions on which reproducing the bug is contingent.
- The steps needed to reproduce the bug or, preferably, a proof of concept.
- The potential implications of the vulnerability being abused.

Anyone who reports a unique, previously-unreported vulnerability that results in a change to the code or a configuration change and who keeps such vulnerability confidential until it has been resolved will be recognized publicly for their contribution if they so choose.

## Eligibility
To be eligible for a reward under this Program, you must:
- Discover a previously unreported, non-public vulnerability in Bancor V3 (but not on any third party platform interacting with Bancor V3) that is within the scope of this Program. Vulnerabilities must be distinct from issues covered in any of the official security audits.
- Be the first to disclose the unique vulnerability to bugbounty@bancor.network, in compliance with the disclosure requirements above. If similar vulnerabilities are reported within the same 24 hour period, rewards will be split at the discretion of Bprotocol Foundation.
- Provide sufficient information to enable contributors to reproduce and fix the vulnerability.
- Not engage in any unlawful conduct when disclosing the bug, including through threats, demands, or any other coercive tactics.
- Not exploit the vulnerability in any way, including through making it public or by obtaining a profit (other than a reward under this Program).
- Make a good faith effort to avoid privacy violations, destruction of data, interruption or degradation of Bancor V3.
- Submit only one vulnerability per submission, unless you need to chain vulnerabilities to provide impact regarding any of the vulnerabilities.
- Not submit a vulnerability caused by an underlying issue that is the same as an issue on which a reward has been paid under this program.
- Not be one of our current or former vendors or contractors or an employee or contractor of any of those vendors or contractors.
- Not be subject to Swiss sanctions or reside in a Swiss-embargoed country.
- Be at least 18 years of age or, if younger, submit your vulnerability with the consent of your parent or guardian.

## Other Terms
By submitting your report, you grant the Bprotocol Foundation any and all rights, including intellectual property rights, needed to validate, mitigate, and disclose the vulnerability. All reward decisions, including eligibility for and amounts of the rewards and the manner in which such rewards will be paid, are made at the sole discretion of the Bprotocol Foundation. The terms and conditions of the Bancor 3 Bug Bounty Program may be altered at any time. The above scope, terms and rewards of the program are at the sole discretion of the Bprotocol Foundation.
