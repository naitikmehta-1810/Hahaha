import { uploadImage } from "../src/services/media.service.js";

const result = await uploadImage({
  dataBase64:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  fileName: "pixel.png",
  folder: "misc",
});

console.log("OK", result.url);
