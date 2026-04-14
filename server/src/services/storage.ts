import fs from "node:fs";
import path from "node:path";
import OSS from "ali-oss";
import { env, uploadsDir } from "../config";

type UploadedFile = Express.Multer.File;

type UploadResult = {
  url: string;
};

interface StorageProvider {
  upload(file: UploadedFile): Promise<UploadResult>;
}

class LocalStorageProvider implements StorageProvider {
  async upload(file: UploadedFile): Promise<UploadResult> {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    return { url: `/uploads/${file.filename}` };
  }
}

class OssStorageProvider implements StorageProvider {
  private client: OSS;
  private bucket: string;

  constructor() {
    if (
      !env.OSS_REGION ||
      !env.OSS_BUCKET ||
      !env.OSS_ACCESS_KEY_ID ||
      !env.OSS_ACCESS_KEY_SECRET
    ) {
      throw new Error("OSS env vars are required when STORAGE_PROVIDER=oss");
    }

    this.bucket = env.OSS_BUCKET;
    this.client = new OSS({
      region: env.OSS_REGION,
      bucket: env.OSS_BUCKET,
      endpoint: env.OSS_ENDPOINT,
      accessKeyId: env.OSS_ACCESS_KEY_ID,
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET
    });
  }

  async upload(file: UploadedFile): Promise<UploadResult> {
    const ext = path.extname(file.originalname || file.filename);
    const objectKey = `zdt/orders/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    try {
      const result = await this.client.put(objectKey, file.path);
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      const defaultUrl = `https://${this.bucket}.${env.OSS_REGION}.aliyuncs.com/${objectKey}`;
      return {
        url: env.OSS_CDN_BASE_URL
          ? `${env.OSS_CDN_BASE_URL.replace(/\/$/, "")}/${objectKey}`
          : result.url || defaultUrl
      };
    } catch (error) {
      console.error("[OSS upload failed] fallback to local:", error);
      return { url: `/uploads/${file.filename}` };
    }
  }
}

const createStorageProvider = (): StorageProvider => {
  if (env.STORAGE_PROVIDER !== "oss") {
    return new LocalStorageProvider();
  }

  try {
    return new OssStorageProvider();
  } catch (error) {
    console.error("[OSS init failed] fallback to local:", error);
    return new LocalStorageProvider();
  }
};

export const storageProvider: StorageProvider = createStorageProvider();
