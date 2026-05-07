import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export const hashPassword = (password) => {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
};
export const verifyPassword = (password, storedHash) => {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) {
        return false;
    }
    const candidateHash = scryptSync(password, salt, 64).toString("hex");
    const originalBuffer = Buffer.from(originalHash, "hex");
    const candidateBuffer = Buffer.from(candidateHash, "hex");
    if (originalBuffer.length !== candidateBuffer.length) {
        return false;
    }
    return timingSafeEqual(originalBuffer, candidateBuffer);
};
