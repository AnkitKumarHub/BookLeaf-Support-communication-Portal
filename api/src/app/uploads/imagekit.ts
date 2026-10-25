import ImageKit from "imagekit";

// The only module that imports the ImageKit SDK. Keys are optional so the API
// boots without them; uploads then answer 503 instead of failing at startup.
let client: ImageKit | null | undefined;

function getClient(): ImageKit | null {
  if (client !== undefined) return client;
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim();
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT?.trim();
  client = publicKey && privateKey && urlEndpoint ? new ImageKit({ publicKey, privateKey, urlEndpoint }) : null;
  return client;
}

export function uploadsConfigured(): boolean {
  return getClient() !== null;
}

export type StoredFile = { fileId: string; url: string };

export async function uploadToImageKit(input: {
  buffer: Buffer;
  fileName: string;
  folder: string;
}): Promise<StoredFile> {
  const ik = getClient();
  if (!ik) throw new Error("ImageKit is not configured");
  const result = await ik.upload({
    file: input.buffer,
    fileName: input.fileName,
    folder: input.folder,
    useUniqueFileName: true,
  });
  return { fileId: result.fileId, url: result.url };
}

// Best effort: used when the database insert fails after a successful upload.
export async function deleteFromImageKit(fileId: string): Promise<void> {
  try {
    await getClient()?.deleteFile(fileId);
  } catch {
    console.error("imagekit delete failed", { fileId });
  }
}

// Used by the db:reset script. Every upload lives under this folder.
export const UPLOAD_ROOT_FOLDER = "/bookleaf";

export async function deleteUploadFolder(): Promise<"deleted" | "empty" | "not-configured"> {
  const ik = getClient();
  if (!ik) return "not-configured";
  try {
    await ik.deleteFolder(UPLOAD_ROOT_FOLDER);
    return "deleted";
  } catch (err) {
    // ImageKit answers 404 when the folder does not exist yet.
    if ((err as { $ResponseMetadata?: { statusCode?: number } }).$ResponseMetadata?.statusCode === 404) return "empty";
    throw err;
  }
}
