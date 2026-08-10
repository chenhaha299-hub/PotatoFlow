const FILE_POLICIES = {
  pdf: { contentType: "application/pdf", disposition: "inline" },
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    disposition: "attachment",
  },
  txt: { contentType: "text/plain; charset=utf-8", disposition: "attachment" },
  md: { contentType: "text/markdown; charset=utf-8", disposition: "attachment" },
  jpg: { contentType: "image/jpeg", disposition: "inline" },
  jpeg: { contentType: "image/jpeg", disposition: "inline" },
  png: { contentType: "image/png", disposition: "inline" },
  webp: { contentType: "image/webp", disposition: "inline" },
  gif: { contentType: "image/gif", disposition: "inline" },
} as const;

export type AllowedExtension = keyof typeof FILE_POLICIES;

export function fileExtension(filename: string): AllowedExtension | null {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return extension in FILE_POLICIES ? (extension as AllowedExtension) : null;
}

export function decodedFilename(value: string | null) {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && !/[\r\n]/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function filenameFromDisposition(value: string | null) {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return decodedFilename(encoded || null);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function hasExpectedSignature(
  bytes: Uint8Array,
  extension: AllowedExtension,
) {
  if (extension === "txt" || extension === "md") {
    return !bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0);
  }
  if (extension === "pdf") {
    return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  }
  if (extension === "docx") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  if (extension === "jpg" || extension === "jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (extension === "png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (extension === "gif") {
    return (
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    );
  }
  return (
    extension === "webp" &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  );
}

export function filePolicy(extension: AllowedExtension) {
  return FILE_POLICIES[extension];
}

export function policyHeaders(
  filename: string | null,
  extension: AllowedExtension | null,
) {
  const headers = new Headers();
  const safeName = filename || "download";
  const policy = extension ? FILE_POLICIES[extension] : null;
  headers.set("Content-Type", policy?.contentType || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `${policy?.disposition || "attachment"}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Cache-Control", "private, no-store");
  return headers;
}
