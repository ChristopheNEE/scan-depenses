// Compression des photos de reçus avant stockage et envoi.
// 1400 px sur le grand côté : assez pour lire un ticket, ~150-250 Ko en JPEG.

const MAX_PX = 1400;
const QUALITY = 0.72;

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible. Si c'est un PDF ou un format HEIC, prends plutôt une photo JPEG."));
    };
    img.src = url;
  });
}

export function base64FromDataUrl(dataUrl) {
  return dataUrl.split(",")[1];
}
