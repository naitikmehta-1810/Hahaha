import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary env vars. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
  }

  return { cloudName, apiKey, apiSecret };
};

const signUploadParams = (params, apiSecret) => {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${apiSecret}`)
    .digest("hex");
};

export async function POST(request) {
  let config;

  try {
    config = getCloudinaryConfig();
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let formData;

  try {
    formData = await request.formData();
  } catch (_error) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const file = formData.get("image");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Please upload a valid image file." }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const uploadParams = {
    folder: "stuffsy/products",
    timestamp,
  };
  const signature = signUploadParams(uploadParams, config.apiSecret);
  const cloudinaryFormData = new FormData();

  cloudinaryFormData.append("file", file);
  cloudinaryFormData.append("api_key", config.apiKey);
  cloudinaryFormData.append("timestamp", String(timestamp));
  cloudinaryFormData.append("folder", uploadParams.folder);
  cloudinaryFormData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    {
      method: "POST",
      body: cloudinaryFormData,
    }
  );
  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Failed to upload image to Cloudinary." },
      { status: response.status }
    );
  }

  return NextResponse.json(
    {
      publicId: data.public_id,
      secureUrl: data.secure_url,
    },
    { status: 201 }
  );
}
