export type ManualSummary = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
};

export type ManualFile = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};
