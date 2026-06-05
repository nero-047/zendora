import "server-only";

import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  getSupabaseStorageS3Config,
  productImageBucket,
} from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

let s3Client: S3Client | null = null;

function getStorageClient() {
  const config = getSupabaseStorageS3Config();

  if (!config) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.endpoint,
      forcePathStyle: true,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return s3Client;
}

function getSafeExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";

  return extension.replace(/[^a-z0-9]/g, "") || "jpg";
}

function getPublicStorageUrl(objectPath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for public image URLs.");
  }

  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${supabaseUrl.replace(
    /\/$/,
    "",
  )}/storage/v1/object/public/${productImageBucket}/${encodedPath}`;
}

export async function uploadProductImageObject(
  storeId: string,
  file: File,
) {
  const objectPath = `${storeId}/${crypto.randomUUID()}.${getSafeExtension(
    file.name,
  )}`;
  const contentType = file.type || "application/octet-stream";
  const body = Buffer.from(await file.arrayBuffer());
  const s3 = getStorageClient();

  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: productImageBucket,
        Key: objectPath,
        Body: body,
        ContentType: contentType,
        CacheControl: "31536000",
      }),
    );

    return {
      imageUrl: getPublicStorageUrl(objectPath),
      imagePath: objectPath,
    };
  }

  const db = getSupabaseAdmin();
  const { error } = await db.storage
    .from(productImageBucket)
    .upload(objectPath, body, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = db.storage.from(productImageBucket).getPublicUrl(objectPath);

  return {
    imageUrl: data.publicUrl,
    imagePath: objectPath,
  };
}

export async function checkProductImageBucketAccess() {
  const s3 = getStorageClient();

  if (s3) {
    await s3.send(new HeadBucketCommand({ Bucket: productImageBucket }));

    return "Product image bucket is reachable through Supabase S3.";
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.getBucket(productImageBucket);

  if (error) {
    throw error;
  }

  if (data?.name !== productImageBucket) {
    throw new Error(`Storage bucket ${productImageBucket} was not found.`);
  }

  return "Product image bucket is reachable through Supabase Storage API.";
}
