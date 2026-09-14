// Client-side only: downscales a picked image to a data: URI before it ever
// leaves the browser. No object storage is wired up (see the schema comment
// on Client.avatarUrl) — everything image-shaped in this app goes straight
// into the DB as a small data: URI instead, so staying small matters.
export function resizeToJpeg(file: File, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported."));
        // center-crop to the target aspect ratio before scaling down, so a
        // mismatched source photo doesn't come out squished
        const targetRatio = width / height;
        const srcRatio = img.width / img.height;
        const [sw, sh] =
          srcRatio > targetRatio ? [img.height * targetRatio, img.height] : [img.width, img.width / targetRatio];
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Same idea, but for attachments that aren't card covers — a task
// screenshot or reference image has no fixed shape to fit, so this scales
// to fit within maxDim on its longer side instead of cropping to a forced
// aspect ratio (which would mangle anything that isn't already ~16:9).
export function resizeToJpegMaxDim(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
