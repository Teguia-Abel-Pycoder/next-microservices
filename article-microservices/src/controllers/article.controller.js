// controllers/article.controller.js
const prisma = require('../prismaClient');
const { ValidationError } = require('../utils/errors');
const { serializeBigInt, validateArticleData } = require('../utils/helpers');
const jwt = require('jsonwebtoken');

/**
 * @swagger
 * /api/articles:
 *   post:
 *     summary: Create a new article
 *     tags: [Articles]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - category
 *               - state
 *               - size
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE, UNISEX]
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *                 minimum: 0
 *               category:
 *                 type: string
 *               state:
 *                 type: string
 *                 enum: [NEW, USED, GOOD, FAIR]
 *               color:
 *                 type: string
 *               brand:
 *                 type: string
 *               size:
 *                 type: string
 *                 enum: [BABY, CHILD, ADULT]
 *               perishable:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *               mainImage:
 *                 type: string
 *                 format: binary
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Article created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const createArticle = async (req, res) => {
  try {
    const {
      name, gender, description, price, category, state,
      color, brand, size, babySize, childSize, adultSize,
      creationDate, perishable, published
    } = req.body;

    // Validate required fields
    const validation = validateArticleData(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validation.errors 
      });
    }
    
    // Get owner from authenticated user
    const owner = req.headers['x-user-username'];
    console.log('headers:', req.headers);
    console.log('Owner from headers:', owner);
    if (!owner) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Handle file uploads
    const mainImageFile = req.files?.mainImage?.[0];
    const imagesFiles = req.files?.images ?? [];

    const mainImage = mainImageFile ? mainImageFile.filename : null;
    const images = imagesFiles.length ? imagesFiles.map(f => f.filename).join(',') : null;

    const articleData = {
      name: name.trim(),
      gender,
      description: description?.trim() || '',
      price: parseFloat(price),
      category,
      state,
      color: color?.trim() || '',
      brand: brand?.trim() || '',
      size,
      babySize: size === 'BABY' ? babySize : null,
      childSize: size === 'CHILD' ? childSize : null,
      adultSize: size === 'ADULT' ? adultSize : null,
      owner,
      creationDate: creationDate ? new Date(creationDate) : new Date(),
      images,
      mainImage,
      perishable: perishable === 'true',
      published: published === 'true',
    };

    const article = await prisma.article.create({
      data: articleData,
      include: {
        offers: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: serializeBigInt(article)
    });

  } catch (error) {
    console.error('Error creating article:', error);
    
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        success: false,
        message: error.message,
        errors: error.details
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Error creating article',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/articles/details/{id}:
 *   get:
 *     summary: Get an article by its ID
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Article ID
 *     responses:
 *       200:
 *         description: Article found
 *       400:
 *         description: Invalid article ID
 *       404:
 *         description: Article not found
 *       500:
 *         description: Server error
 */
const getArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid article ID format' 
      });
    }

    const articleId = BigInt(id);

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: {
        offers: {
          orderBy: {
            createdDate: 'desc'
          }
        }
      }
    });

    if (!article) {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }

    res.json({
      success: true,
      data: serializeBigInt(article)
    });

  } catch (error) {
    console.error('Error retrieving article:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving article',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const updateArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    const owner = req.headers['x-user-username'];

    if (!owner) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid article ID format' 
      });
    }

    const articleId = BigInt(id);

    // Check if article exists and user is owner
    const existingArticle = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!existingArticle) {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }

    if (existingArticle.owner !== owner) {
      return res.status(403).json({ 
        success: false,
        message: 'You are not authorized to update this article' 
      });
    }

    // Handle file uploads
    let images;
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => file.filename).join(',');
    }

    // Build update data
    const {
      name, gender, description, price, category, state,
      color, brand, size, babySize, childSize, adultSize,
      perishable, published
    } = req.body;

    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (gender) updateData.gender = gender;
    if (description !== undefined) updateData.description = description.trim();
    if (price) updateData.price = parseFloat(price);
    if (category) updateData.category = category;
    if (state) updateData.state = state;
    if (color !== undefined) updateData.color = color.trim();
    if (brand !== undefined) updateData.brand = brand.trim();
    if (size) {
      updateData.size = size;
      // Reset size-specific fields
      updateData.babySize = null;
      updateData.childSize = null;
      updateData.adultSize = null;
      
      // Set appropriate size field
      if (size === 'BABY' && babySize) updateData.babySize = babySize;
      if (size === 'CHILD' && childSize) updateData.childSize = childSize;
      if (size === 'ADULT' && adultSize) updateData.adultSize = adultSize;
    }
    if (perishable !== undefined) updateData.perishable = perishable === 'true';
    if (published !== undefined) updateData.published = published === 'true';
    if (images) updateData.images = images;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No valid fields provided for update' 
      });
    }

    updateData.updatedDate = new Date();

    const updatedArticle = await prisma.article.update({
      where: { id: articleId },
      data: updateData,
      include: {
        offers: true
      }
    });

    res.json({
      success: true,
      message: 'Article updated successfully',
      data: serializeBigInt(updatedArticle)
    });

  } catch (error) {
    console.error('Error updating article:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error updating article',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deleteArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    const owner = req.headers['x-user-username'];

    if (!owner) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid article ID format' 
      });
    }

    const articleId = BigInt(id);

    // Check ownership before deletion
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article) {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }

    if (article.owner !== owner) {
      return res.status(403).json({ 
        success: false,
        message: 'You are not authorized to delete this article' 
      });
    }

    await prisma.article.delete({
      where: { id: articleId }
    });

    res.json({ 
      success: true,
      message: 'Article deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting article:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error deleting article',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const togglePublishArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { published } = req.body;
    const owner = req.headers['x-user-username'];

    if (!owner) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid article ID format' 
      });
    }

    if (published === undefined) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing "published" field in request body' 
      });
    }

    const articleId = BigInt(id);

    // Check ownership
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article) {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }

    if (article.owner !== owner) {
      return res.status(403).json({ 
        success: false,
        message: 'You are not authorized to modify this article' 
      });
    }

    const isPublished = String(published).toLowerCase() === 'true';

    const updatedArticle = await prisma.article.update({
      where: { id: articleId },
      data: { 
        published: isPublished,
        updatedDate: new Date()
      },
      include: {
        offers: true
      }
    });

    res.json({
      success: true,
      message: `Article ${isPublished ? 'published' : 'unpublished'} successfully`,
      data: serializeBigInt(updatedArticle)
    });

  } catch (error) {
    console.error('Error in togglePublishArticle:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Failed to update publish status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getUserArticles = async (req, res) => {
  try {
    const username = req.headers['x-user-username'];
    const { page = 1, limit = 10, status = 'all' } = req.query;

    if (!username) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { owner: username };

    if (status === 'published') where.published = true;
    if (status === 'draft') where.published = false;

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        include: {
          offers: {
            orderBy: {
              createdDate: 'desc'
            }
          }
        },
        orderBy: {
          creationDate: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.article.count({ where })
    ]);

    res.json({
      success: true,
      data: serializeBigInt(articles),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error retrieving user articles:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving user articles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getAllArticlesSortedByLatest = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, gender, state, minPrice, maxPrice } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { published: true };

    // Add filters
    if (category) where.category = category;
    if (gender) where.gender = gender;
    if (state) where.state = state;
    if (minPrice) where.price = { ...where.price, gte: parseFloat(minPrice) };
    if (maxPrice) where.price = { ...where.price, lte: parseFloat(maxPrice) };

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        include: {
          offers: {
            select: {
              id: true,
              price: true,
              status: true,
              username: true
            }
          }
        },
        orderBy: {
          creationDate: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.article.count({ where })
    ]);

    res.json({
      success: true,
      data: serializeBigInt(articles),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve articles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getArticlesByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!username) {
      return res.status(400).json({ 
        success: false,
        message: 'Username is required' 
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: {
          owner: username,
          published: true // Only show published articles
        },
        include: {
          offers: {
            select: {
              id: true,
              price: true,
              status: true
            }
          }
        },
        orderBy: {
          creationDate: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.article.count({
        where: {
          owner: username,
          published: true
        }
      })
    ]);

    res.json({
      success: true,
      data: serializeBigInt(articles),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching articles by username:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve user articles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Legacy offer function - deprecated, use offer controller instead
const makeOrUpdateOffer = async (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Please use /offer/create instead.'
  });
};

module.exports = {
  createArticle,
  getArticleById,
  updateArticleById,
  deleteArticleById,
  togglePublishArticle,
  getUserArticles,
  getAllArticlesSortedByLatest,
  getArticlesByUsername,
  makeOrUpdateOffer
};