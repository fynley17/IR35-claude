/*
 * Shared question set — used by the free check, the paid check and the server.
 * Option `risk` is 0 (points away from employment) to 3 (points strongly towards it).
 * `risk: null` means the question shapes the advice but is not scored.
 */
(function (root) {
  var QUESTIONS = [
    {
      id: 'clientSize',
      pillar: 'Who decides',
      text: 'Who is the end client you will be working for?',
      hint: 'A private-sector client is "small" if it meets two of: turnover up to £15m, balance sheet up to £7.5m, 50 or fewer employees.',
      options: [
        { id: 'small', risk: null, label: 'A small private-sector company', full: 'A small private-sector company (the contractor\'s own company decides IR35 status)' },
        { id: 'mediumLarge', risk: null, label: 'A medium or large private-sector company', full: 'A medium or large private-sector company (the client decides status and must issue a Status Determination Statement)' },
        { id: 'public', risk: null, label: 'A public sector body', full: 'A public sector body (the client decides status and must issue a Status Determination Statement)' },
        { id: 'unsure', risk: null, label: 'Not sure', full: 'The contractor is not sure of the client\'s size' }
      ]
    },
    {
      id: 'sds',
      pillar: 'Who decides',
      text: 'Have you received a Status Determination Statement (SDS) from the client?',
      options: [
        { id: 'outside', risk: null, label: 'Yes — it says outside IR35', full: 'Yes — the SDS concludes outside IR35' },
        { id: 'inside', risk: null, label: 'Yes — it says inside IR35', full: 'Yes — the SDS concludes inside IR35' },
        { id: 'notYet', risk: null, label: 'Not yet', full: 'Not yet received an SDS' },
        { id: 'na', risk: null, label: 'Not applicable / small client', full: 'Not applicable (small client)' }
      ]
    },
    {
      id: 'substitution',
      pillar: 'Substitution',
      text: 'If you couldn\'t work, could you send a suitably qualified substitute in your place?',
      options: [
        { id: 'genuine', risk: 0, label: 'Yes — the contract allows it and the client would genuinely accept someone else', full: 'Yes — the contract allows it and the client would genuinely accept a substitute' },
        { id: 'paperOnly', risk: 2, label: 'The contract allows it, but in practice the client expects me personally', full: 'The contract allows it but in practice the client would expect the contractor personally' },
        { id: 'no', risk: 3, label: 'No — the contract requires me personally', full: 'No — the contract requires personal service and a substitute could not be sent' },
        { id: 'unclear', risk: 2, label: 'Unclear — the contract doesn\'t say', full: 'Unclear — the contract does not address substitution' }
      ]
    },
    {
      id: 'substitutionUsed',
      pillar: 'Substitution',
      text: 'Has a substitute ever actually been used, or would the client realistically accept one?',
      options: [
        { id: 'used', risk: 0, label: 'Yes — a substitute has actually been used', full: 'Yes — a substitute has actually been sent' },
        { id: 'wouldAccept', risk: 1, label: 'Never tested, but I believe the client would accept one', full: 'Never tested but the contractor believes the client would accept one' },
        { id: 'doubt', risk: 3, label: 'Never tested, and I doubt the client would accept one', full: 'Never tested and the contractor doubts the client would accept one' },
        { id: 'new', risk: 1, label: 'New engagement — not tested yet', full: 'Not applicable — new engagement' }
      ]
    },
    {
      id: 'control',
      pillar: 'Control',
      text: 'Who decides how the work is done day to day?',
      options: [
        { id: 'me', risk: 0, label: 'I do — I\'m given an outcome, not told how to achieve it', full: 'The contractor decides how the work is done — given an outcome, not told how to achieve it' },
        { id: 'mix', risk: 1, label: 'A mix — some direction, but I have significant autonomy', full: 'A mix — some direction from the client on methods but significant autonomy' },
        { id: 'client', risk: 3, label: 'Mostly the client — they direct my methods, priorities and daily tasks', full: 'Mostly the client — they direct methods, priorities and daily tasks' }
      ]
    },
    {
      id: 'autonomy',
      pillar: 'Control',
      text: 'Do you control your own working hours and location?',
      options: [
        { id: 'yes', risk: 0, label: 'Yes — I set my own hours and choose where I work', full: 'Yes — sets own hours and chooses where to work' },
        { id: 'mostly', risk: 1, label: 'Mostly — some core hours or on-site days, but generally flexible', full: 'Mostly — some core hours or on-site days required but generally flexible' },
        { id: 'no', risk: 3, label: 'No — I\'m expected to work set hours at the client\'s site', full: 'No — expected to work set hours at the client\'s premises' }
      ]
    },
    {
      id: 'mutuality',
      pillar: 'Mutuality of obligation',
      text: 'Is the client obliged to give you work, and are you obliged to do what they offer?',
      hint: 'Since the Supreme Court\'s 2024 PGMOL decision, obligations inside a single engagement can be enough — so most fixed engagements will show some mutuality.',
      options: [
        { id: 'none', risk: 0, label: 'No — I deliver a defined project; new work needs a new agreement', full: 'No — a defined project; any new work requires a new agreement' },
        { id: 'some', risk: 2, label: 'The client can give me further tasks and I\'m expected to be available', full: 'The client can add further tasks within the engagement and the contractor is expected to be available' },
        { id: 'strong', risk: 3, label: 'Yes — the client must provide work and I must accept what\'s offered', full: 'Yes — the client must provide work and the contractor must accept all work offered' }
      ]
    },
    {
      id: 'financialRisk',
      pillar: 'Financial risk',
      text: 'Do you bear genuine financial risk?',
      hint: 'For example fixed-price deliverables, fixing errors in your own time and at your own cost, or professional indemnity insurance.',
      options: [
        { id: 'significant', risk: 0, label: 'Yes — fixed-price work, or I fix errors at my own cost', full: 'Yes — significant financial risk, including fixed-price work or correcting errors at own cost' },
        { id: 'some', risk: 1, label: 'Some — I have PI insurance but I\'m paid a day or hourly rate', full: 'Some risk — has professional indemnity insurance but is paid a day/hourly rate' },
        { id: 'none', risk: 3, label: 'No — I\'m paid for time with no risk for errors or overruns', full: 'No — paid a day/hourly rate with no financial risk for errors or overruns' }
      ]
    },
    {
      id: 'integration',
      pillar: 'Part and parcel',
      text: 'Will you be embedded in the client\'s organisation?',
      hint: 'Line manager, org chart, staff email address, team events, staff perks, managing employees.',
      options: [
        { id: 'no', risk: 0, label: 'No — I work independently and am clearly an external contractor', full: 'No — works independently and is clearly identified as an external contractor' },
        { id: 'somewhat', risk: 1, label: 'Somewhat — I attend some meetings and use their systems', full: 'Somewhat — attends some meetings and uses client systems but is clearly a contractor' },
        { id: 'yes', risk: 3, label: 'Yes — line manager, internal comms, team events, like staff', full: 'Yes — fully embedded with a line manager, internal comms and team events' }
      ]
    },
    {
      id: 'equipment',
      pillar: 'Equipment',
      text: 'Will you use your own equipment to do the work?',
      options: [
        { id: 'own', risk: 0, label: 'Yes — my own laptop, software and tools', full: 'Yes — uses own laptop, software and tools' },
        { id: 'mostly', risk: 1, label: 'Mostly mine, but the client provides access or specific systems', full: 'Mostly own equipment but the client provides access or specific systems' },
        { id: 'client', risk: 2, label: 'No — the client provides my laptop and equipment', full: 'No — the client provides laptop, tools and equipment' }
      ]
    },
    {
      id: 'multipleClients',
      pillar: 'In business on own account',
      text: 'Do you run a genuine business with other clients?',
      options: [
        { id: 'yes', risk: 0, label: 'Yes — I work for several clients and market my services', full: 'Yes — works for multiple clients simultaneously and markets services' },
        { id: 'past', risk: 1, label: 'Not right now, but I have before and nothing prevents it', full: 'Not currently but has done in the past and the contract does not prevent it' },
        { id: 'onlyNoClause', risk: 1, label: 'This is my only client, but there\'s no exclusivity clause', full: 'Only client but no exclusivity clause' },
        { id: 'exclusive', risk: 3, label: 'No — the contract requires exclusivity', full: 'No — only client and the contract requires exclusivity' }
      ]
    },
    {
      id: 'termination',
      pillar: 'Other terms',
      text: 'How can the engagement be ended?',
      options: [
        { id: 'commercial', risk: 0, label: 'Fixed scope or commercial notice terms, with penalties for early exit', full: 'Fixed scope or commercial notice terms, with financial consequences for early termination' },
        { id: 'notice', risk: 1, label: 'A notice period (1–4 weeks) on both sides, no real penalty', full: 'A notice period of 1-4 weeks on both sides with no significant penalty' },
        { id: 'atWill', risk: 2, label: 'The client can end it with little or no notice', full: 'The client can terminate with very little notice and no penalty' }
      ]
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = QUESTIONS;
  else root.IR35_QUESTIONS = QUESTIONS;
})(this);
