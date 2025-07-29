// found in utils/helpers.js

function serializeBigInt(obj) {
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

/**
 * Validate article data
 */
function validateArticleData(data) {
  const errors = {};
  
  // Required fields
  if (!data.name || data.name.trim().length === 0) {
    errors.name = 'Name is required';
  } else if (data.name.trim().length > 255) {
    errors.name = 'Name must be less than 255 characters';
  }
  
  if (!data.price || isNaN(parseFloat(data.price)) || parseFloat(data.price) <= 0) {
    errors.price = 'Price must be a valid positive number';
  }
  
  if (!data.category) {
    errors.category = 'Category is required';
  }
  
  if (!data.state) {
    errors.state = 'State is required';
  }
  
  if (!data.size) {
    errors.size = 'Size is required';
  }
  
  // Validate enum values
  const validGenders = ['MALE', 'FEMALE', 'UNISEX'];
  if (data.gender && !validGenders.includes(data.gender)) {
    errors.gender = 'Invalid gender value';
  }
  
  const validStates = ['NEW', 'USED', 'GOOD', 'FAIR'];
  if (data.state && !validStates.includes(data.state)) {
    errors.state = 'Invalid state value';
  }
  
  const validSizes = ['BABY', 'CHILD', 'ADULT'];
  if (data.size && !validSizes.includes(data.size)) {
    errors.size = 'Invalid size value';
  }
  
  // Size-specific validation
  if (data.size === 'BABY' && data.babySize) {
    const validBabySizes = [
      'THREE_MONTHS', 'THREE_TO_SIX_MONTHS', 'SIX_TO_NINE_MONTHS',
      'NINE_TO_TWELVE_MONTHS', 'TWELVE_TO_EIGHTEEN_MONTHS', 'EIGHTEEN_TO_TWENTY_FOUR_MONTHS'
    ];
    if (!validBabySizes.includes(data.babySize)) {
      errors.babySize = 'Invalid baby size value';
    }
  }
  
  if (data.size === 'CHILD' && data.childSize) {
    const validChildSizes = [
      'TWO_TO_FOUR_YEARS', 'FOUR_TO_SIX_YEARS', 'SIX_TO_EIGHT_YEARS',
      'EIGHT_TO_TEN_YEARS', 'TEN_TO_TWELVE_YEARS'
    ];
    if (!validChildSizes.includes(data.childSize)) {
      errors.childSize = 'Invalid child size value';
    }
  }
  
  if (data.size === 'ADULT' && data.adultSize) {
    const validAdultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'THREE_XL', 'FOUR_XL', 'FIVE_XL'];
    if (!validAdultSizes.includes(data.adultSize)) {
      errors.adultSize = 'Invalid adult size value';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Sanitize string input
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

/**
 * Generate pagination metadata
 */
function getPaginationMeta(page, limit, total) {
  const currentPage = parseInt(page);
  const itemsPerPage = parseInt(limit);
  const totalPages = Math.ceil(total / itemsPerPage);
  
  return {
    page: currentPage,
    limit: itemsPerPage,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
    prevPage: currentPage > 1 ? currentPage - 1 : null
  };
}

/**
 * Format error response
 */
function formatErrorResponse(error, message = 'An error occurred') {
  return {
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format success response
 */
function formatSuccessResponse(data, message = 'Success') {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate BigInt ID
 */
function validateId(id) {
  if (!id) {
    return { isValid: false, error: 'ID is required' };
  }
  
  const numId = parseInt(id);
  if (isNaN(numId) || numId <= 0) {
    return { isValid: false, error: 'Invalid ID format' };
  }
  
  return { isValid: true, bigIntId: BigInt(id) };
}

/**
 * Clean object by removing undefined/null values
 */
function cleanObject(obj) {
  const cleaned = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined && obj[key] !== null) {
      cleaned[key] = obj[key];
    }
  });
  return cleaned;
}

module.exports = {
  serializeBigInt,
  validateArticleData,
  sanitizeString,
  getPaginationMeta,
  formatErrorResponse,
  formatSuccessResponse,
  validateId,
  cleanObject,
  validateArticleData
};

