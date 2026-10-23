import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

export const DEFAULT_LIMITS = { maxBounce: 0.02, maxComplaint: 0.001, minSample: 100 };

/** Pure decision: stop when the hard-bounce or complaint rate of the campaign exceeds its limit. */
export function evaluateRates({ send, bounce, complaint }, limits = DEFAULT_LIMITS) {
  const { maxBounce, maxComplaint, minSample } = { ...DEFAULT_LIMITS, ...limits };
  if (!send || send < minSample) {
    return { ok: true, enough: false, send: send || 0, bounce, complaint, reason: `sample too small (${send || 0} < ${minSample})` };
  }
  const bounceRate = bounce / send;
  const complaintRate = complaint / send;
  if (bounceRate > maxBounce) {
    return { ok: false, enough: true, send, bounce, complaint, bounceRate, complaintRate, reason: `bounce rate ${(bounceRate * 100).toFixed(2)}% > ${(maxBounce * 100).toFixed(2)}%` };
  }
  if (complaintRate > maxComplaint) {
    return { ok: false, enough: true, send, bounce, complaint, bounceRate, complaintRate, reason: `complaint rate ${(complaintRate * 100).toFixed(3)}% > ${(maxComplaint * 100).toFixed(3)}%` };
  }
  return { ok: true, enough: true, send, bounce, complaint, bounceRate, complaintRate, reason: 'within limits' };
}

/**
 * Reads the campaign counters published by the SES configuration set to CloudWatch
 * (namespace AWS/SES, dimension = message tag set on every send).
 */
export async function fetchCampaignCounts({ region, dimensionName, dimensionValue, windowMinutes = 360, client }) {
  const cw = client || new CloudWatchClient({ region });
  const end = new Date();
  const start = new Date(end.getTime() - windowMinutes * 60 * 1000);
  const sum = async (metric) => {
    const res = await cw.send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/SES',
        MetricName: metric,
        Dimensions: [{ Name: dimensionName, Value: dimensionValue }],
        StartTime: start,
        EndTime: end,
        Period: windowMinutes * 60,
        Statistics: ['Sum'],
      })
    );
    return (res.Datapoints || []).reduce((acc, d) => acc + (d.Sum || 0), 0);
  };
  const [send, bounce, complaint] = await Promise.all([sum('Send'), sum('Bounce'), sum('Complaint')]);
  return { send, bounce, complaint };
}
