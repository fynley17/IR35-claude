'use strict';
// A worked example used on the public /sample-report page and in local development (FAKE_AI=1).
// It describes a fictional contract — no real client or contractor.
module.exports = {
  overallRisk: 'MEDIUM',
  riskScore: 6,
  confidence: 'MEDIUM',
  summary:
    'The written contract contains several outside-IR35 style clauses, but the way you describe the work — set hours on site, day-to-day direction from a client manager and no realistic substitution — points the other way. On these facts the working practices are likely to carry more weight than the paperwork, so the overall risk is medium, leaning towards high if nothing changes.',
  responsibility:
    'You told us the end client is a medium or large private-sector company, so the client — not your company — must decide your status and give you a Status Determination Statement (SDS) with reasons. This report is most useful to check that SDS and to support a challenge if you disagree with it.',
  documentCoverage:
    'Reviewed a 14-page agency–contractor consultancy agreement and its Schedule 1 (services). The upstream agency–client terms were not supplied, so we cannot see what the client has agreed with the agency about substitution or control.',
  keyFactors: [
    {
      factor: 'Personal service and substitution',
      status: 'WARNING',
      clauseReferences: ['Clause 6.1 Substitution', 'Clause 6.3 Client approval'],
      contractPosition: 'Clause 6.1 allows a substitute, but clause 6.3 makes it "subject to the prior written approval of the Client, such approval to be at the Client\'s absolute discretion".',
      realityPosition: 'You said a substitute has never been used and you doubt the client would accept one.',
      contradiction: true,
      detail: 'A right of substitution that the client can veto at its absolute discretion carries little weight, and here it has never been tested. Tribunals look at whether the right is genuine and realistic, not just whether the words appear.',
    },
    {
      factor: 'Control',
      status: 'RED_FLAG',
      clauseReferences: ['Clause 4.2 Manner of performance', 'Schedule 1 para 3'],
      contractPosition: 'Clause 4.2 says the consultant "shall determine the manner in which the Services are performed", but Schedule 1 para 3 requires attendance at daily stand-ups and working "in accordance with the Client\'s reasonable instructions".',
      realityPosition: 'You said the client directs your methods, priorities and daily tasks, and you work set hours on site.',
      contradiction: true,
      detail: 'After PGMOL, control does not need to be day-to-day instruction; a sufficient framework of control is enough. Your answers suggest the client controls what, how, when and where — the strongest single indicator in this report.',
    },
    {
      factor: 'Mutuality of obligation',
      status: 'WARNING',
      clauseReferences: ['Clause 3.1 Services', 'Clause 3.4 Additional services'],
      contractPosition: 'Clause 3.4 lets the client add "such additional services as the Client may reasonably require" within the term.',
      realityPosition: 'You said the client can give further tasks and you are expected to be available.',
      contradiction: false,
      detail: 'Mutual obligations within a single engagement are enough for this test (PGMOL, 2024). An open-ended right for the client to add work makes the engagement look more like employment than a defined project.',
    },
    {
      factor: 'Financial risk',
      status: 'WARNING',
      clauseReferences: ['Clause 9 Fees', 'Clause 12 Insurance'],
      contractPosition: 'Paid a daily rate (clause 9). Clause 12 requires professional indemnity insurance.',
      realityPosition: 'You hold PI insurance but are paid for time with no fixed-price element.',
      contradiction: false,
      detail: 'Holding insurance helps a little, but being paid for time with no risk of loss is closer to an employee\'s position. There is no obligation to fix defects at your own cost.',
    },
    {
      factor: 'Part and parcel',
      status: 'RED_FLAG',
      clauseReferences: ['Not addressed in the documents'],
      contractPosition: 'The contract does not deal with integration.',
      realityPosition: 'You said you have a line manager, internal email and attend team events.',
      contradiction: false,
      detail: 'Being treated like a member of staff — line management, internal comms and team events — points towards employment. This comes from working practice rather than the contract.',
    },
    {
      factor: 'Equipment',
      status: 'POSITIVE',
      clauseReferences: ['Clause 7.2 Equipment'],
      contractPosition: 'Clause 7.2 says the consultant provides their own equipment.',
      realityPosition: 'You use your own laptop and tools, with client system access.',
      contradiction: false,
      detail: 'Providing your own equipment is a modest positive. Access to client systems is normal and carries little weight either way.',
    },
    {
      factor: 'In business on own account',
      status: 'POSITIVE',
      clauseReferences: ['Clause 15 Other engagements'],
      contractPosition: 'Clause 15 expressly allows other engagements that do not conflict.',
      realityPosition: 'You have worked for other clients and nothing prevents it now.',
      contradiction: false,
      detail: 'Evidence that you run a genuine business — other clients, marketing, your own company — forms part of the overall picture (Atholl House, 2022).',
    },
    {
      factor: 'Termination and other terms',
      status: 'WARNING',
      clauseReferences: ['Clause 18 Termination'],
      contractPosition: 'Either party may terminate on two weeks\' notice; the client may terminate immediately for convenience.',
      realityPosition: 'You said there is a short notice period with no real penalty.',
      contradiction: false,
      detail: 'A client right to end the engagement at will is neutral to slightly negative. There are no employee-style benefits (holiday or sick pay), which is a positive.',
    },
  ],
  redFlags: [
    'The client directs how, when and where you work (Schedule 1 para 3 and your answers).',
    'Substitution is subject to the client\'s absolute discretion (clause 6.3) and has never been tested.',
    'You are integrated like staff: line manager, internal email and team events.',
  ],
  positives: [
    'You provide your own equipment (clause 7.2).',
    'The contract allows other engagements, and you have other clients (clause 15).',
    'No employee-style benefits such as holiday or sick pay.',
  ],
  recommendations: [
    {
      title: 'Narrow the client\'s veto on substitution (clause 6.3)',
      detail: 'Ask for approval to be refused only on objective grounds, and keep evidence of what a substitute would need.',
      suggestedWording: 'The Client may only refuse a proposed substitute where the substitute does not have equivalent skills, qualifications and security clearance to the Consultant. Such approval shall not be unreasonably withheld or delayed.',
    },
    {
      title: 'Replace the "reasonable instructions" wording in Schedule 1',
      detail: 'Describe deliverables and acceptance criteria instead of attendance and instructions, and make sure working practice matches.',
      suggestedWording: 'The Consultant will deliver the Services described in the Statement of Work. The Consultant will determine the method, timing and location of performance, subject only to the Client\'s reasonable security and access requirements.',
    },
    {
      title: 'Turn open-ended additional services into change requests (clause 3.4)',
      detail: 'Additional work should need a written, agreed change to scope and fees, so the engagement is a defined project.',
      suggestedWording: '',
    },
    {
      title: 'Reduce integration in practice',
      detail: 'Avoid line-management language, staff events and staff benefits. Record that you report on deliverables, not to a manager.',
      suggestedWording: '',
    },
  ],
  sdsNotes:
    'Ask the client for its SDS and the reasons behind it. If it says outside IR35 but your day-to-day reality looks like this, the client may revisit it. If it says inside and you disagree, you can make representations; the client must respond within 45 days, either confirming its reasons or issuing a new SDS.',
  nextSteps:
    'Raise the substitution, control and additional-services clauses with the agency before signing, then check that working practice really changes. Given the medium–high risk, have an IR35 specialist or accountant review the final contract and your SDS.',
};
