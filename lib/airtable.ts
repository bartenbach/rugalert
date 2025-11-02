import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID!
);

export const tb = {
  validators: base('validators'),
  snapshots: base('snapshots'),
  events: base('events'),
  subs: base('subs'),
  stakeHistory: base('stakeHistory'),
  performanceHistory: base('performanceHistory'),
  mevSnapshots: base('mev_snapshots'),
  mevEvents: base('mev_events'),
  dailyUptime: base('daily_uptime'),
  validatorInfoHistory: base('validator_info_history'),
};

