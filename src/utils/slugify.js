/**
 * Generate a URL-friendly slug from a product name
 * @param {string} name - Product name
 * @returns {string} URL-friendly slug
 */
export const generateProductSlug = (name) => {
  if (!name) return "product";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .slice(0, 100); // Limit length
};

/**
 * Decode product slug back to display name (optional - for reference)
 * @param {string} slug - URL slug
 * @returns {string} Display name
 */
export const decodeProductSlug = (slug) => {
  return slug.replace(/-/g, " ");
};
