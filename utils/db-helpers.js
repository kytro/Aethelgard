/**
 * Database Helper Utilities
 * Common DB operations and validation
 */

const { ObjectId } = require('mongodb');

/**
 * Validates if a string is a valid MongoDB ObjectId.
 * Checks both the format and length.
 * @param {string|ObjectId} id - The ID to check
 * @returns {boolean} True if valid
 */
const isValidObjectId = (id) => {
    if (!id) return false;
    if (id instanceof ObjectId) return true;
    return typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Safely converts a string to an ObjectId if valid, otherwise returns it as is.
 * Useful for mixed ID types (legacy strings vs ObjectIds).
 * @param {string|ObjectId} id 
 * @returns {ObjectId|string}
 */
const toObjectId = (id) => {
    if (isValidObjectId(id)) {
        return new ObjectId(id);
    }
    return id;
};

/**
 * Escapes a string for use in a regular expression.
 * @param {string} string 
 * @returns {string}
 */
const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& = whole match
};

module.exports = {
    isValidObjectId,
    toObjectId,
    escapeRegExp
};
