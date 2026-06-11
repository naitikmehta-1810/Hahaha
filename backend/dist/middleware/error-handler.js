export function notFound(_req, res) {
    res.status(404).json({ message: "Route not found" });
}
export function errorHandler(err, _req, res, _next) {
    if (typeof err === "object" && err && "code" in err) {
        const code = String(err.code);
        if (code === "23505") {
            res.status(409).json({ message: "An account with this email or phone number already exists" });
            return;
        }
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ message });
}
