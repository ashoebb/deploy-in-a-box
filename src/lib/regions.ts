export const SUPPORTED_REGIONS = [
  { id: "us-east-1", label: "US East (N. Virginia)" },
  { id: "us-east-2", label: "US East (Ohio)" },
  { id: "us-west-2", label: "US West (Oregon)" },
  { id: "eu-west-1", label: "Europe (Ireland)" },
  { id: "eu-central-1", label: "Europe (Frankfurt)" },
  { id: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { id: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { id: "me-south-1", label: "Middle East (Bahrain)" },
] as const;

export const REGION_IDS = SUPPORTED_REGIONS.map((r) => r.id);
export type RegionId = (typeof SUPPORTED_REGIONS)[number]["id"];
