import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mediaDir, encryptionKey, put, workDir } from "./store.ts";
import { publicFetch } from "./network.ts";
import type { Asset } from "../shared/types.ts";
export const s3 = process.env.S3_BUCKET
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;
export const bucket = process.env.S3_BUCKET;
export async function storeFile(file: string, asset: Asset) {
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: asset.key,
        Body: createReadStream(file),
        ContentLength: (await stat(file)).size,
        ContentType: asset.mime,
      }),
    );
    await unlink(file);
  }
  return put("assets", asset);
}
export async function downloadAsset(asset: Asset, destination: string) {
  if (!s3) {
    await pipeline(
      createReadStream(path.join(mediaDir, asset.key)),
      createWriteStream(destination),
    );
    return;
  }
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: asset.key }),
  );
  await pipeline(response.Body as Readable, createWriteStream(destination));
}
export async function assetDataURL(asset: Asset) {
  const temp = path.join(workDir, `${crypto.randomUUID()}.image`);
  try {
    await downloadAsset(asset, temp);
    return `data:${asset.mime};base64,${(await readFile(temp)).toString("base64")}`;
  } finally {
    await unlink(temp).catch(() => {});
  }
}
function signature(id: string, expires: number) {
  return createHmac("sha256", encryptionKey)
    .update(`${id}:${expires}`)
    .digest("hex");
}
export function previewURL(asset: Asset, apiBase: string, thumbnail = false) {
  const expires = Date.now() + 3600000;
  return `${apiBase}/api/previews/${asset.id}?thumbnail=${thumbnail ? "1" : "0"}&expires=${expires}&signature=${signature((thumbnail ? "thumbnail:" : "preview:") + asset.id, expires)}`;
}
export async function mediaURL(asset: Asset, apiBase: string) {
  if (s3)
    return getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: asset.key }),
      { expiresIn: 3600 },
    );
  const expires = Date.now() + 3600000;
  return `${apiBase}/api/media/${asset.id}?expires=${expires}&signature=${signature(asset.id, expires)}`;
}
export function validMediaSignature(id: string, expires: string, sig: string) {
  if (
    !/^\d+$/.test(expires) ||
    Number(expires) < Date.now() ||
    !/^[a-f0-9]{64}$/.test(sig)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature(id, Number(expires))),
    Buffer.from(sig),
  );
}
export async function copyRemote(
  url: string,
  destination: string,
  limit = 500 * 1024 * 1024,
) {
  const response = await publicFetch(url);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > limit
          ? new Error("Generated file exceeds storage limit")
          : null,
        chunk,
      );
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as any),
    limiter,
    createWriteStream(destination),
  );
  return {
    mime:
      response.headers.get("content-type")?.split(";")[0] ||
      "application/octet-stream",
    size: bytes,
  };
}
export async function deleteStored(asset: Asset) {
  if (s3)
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.key }));
  else await unlink(path.join(mediaDir, asset.key)).catch(() => {});
}
