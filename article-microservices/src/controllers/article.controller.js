const prisma = require('../prismaClient');
function serializeBigInt(obj) {
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}



/**
 * @swagger
 * /article-api:
 *   post:
 *     summary: Create a new article
 *     tags: [Articles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               gender:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *               state:
 *                 type: string
 *               color:
 *                 type: string
 *               brand:
 *                 type: string
 *               size:
 *                 type: string
 *               perishable:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *               creationDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Article created successfully
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

    // 👇 Get owner from the forwarded header
    const owner = req.headers['x-user-username'];
    const mainImageFile = req.files?.mainImage?.[0];
    const imagesFiles = req.files?.images ?? [];

    const mainImage = mainImageFile ? mainImageFile.filename : '';
    const images = imagesFiles.length ? imagesFiles.map(f => f.filename).join(',') : '';


    const article = await prisma.article.create({
      data: {
        name,
        gender,
        description,
        price: parseFloat(price),
        category,
        state,
        color,
        brand,
        size,
        babySize,
        childSize,
        adultSize,
        owner,
        creationDate: new Date(creationDate),
        images,
        mainImage,
        perishable: perishable === 'true',
        published: published === 'true',
        
      },
    });

    res.status(201).json(serializeBigInt(article));

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating article', error });
  }
};


// OpenAPI/Swagger documentation for /article-api/{id} endpoint moved to comment to avoid JS errors.
/*
paths:
  /article-api/{id}:
    get:
      summary: Get an article by its ID
      description: Retrieves a single article by its unique identifier
      tags: [Articles]
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
            format: int64
          description: Numeric ID of the article to retrieve
      responses:
        '200':
          description: Article found and returned successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Article'
        '400':
          description: Invalid article ID provided
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: "Invalid article ID"
        '404':
          description: Article not found
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: "Article not found"
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: "Error retrieving article"
                  error:
                    type: string
                    example: "Error details..."
*/

const getArticleById = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);

    if (isNaN(articleId)) {
      return res.status(400).json({ message: 'Invalid article ID' });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });

    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    // Convert BigInt fields to string if needed (e.g. id)
    const safeArticle = JSON.parse(JSON.stringify(article, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    res.json(safeArticle);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving article', error });
  }
};

const updateArticleById = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (isNaN(articleId)) {
      return res.status(400).json({ message: 'Invalid article ID' });
    }

    // Prepare images field: if a new file uploaded, update images; otherwise keep existing
    let images;
    if (req.files && req.files.length > 0) {
    images = req.files.map(file => file.filename).join(',');
    }

    // Build data object dynamically to update only provided fields
    const {
      name, gender, description, price, category, state,
      color, brand, size, babySize, childSize, adultSize,
      owner, creationDate, perishable, published
    } = req.body;

    const dataToUpdate = {
      ...(name && { name }),
      ...(gender && { gender }),
      ...(description && { description }),
      ...(price && { price: parseFloat(price) }),
      ...(category && { category }),
      ...(state && { state }),
      ...(color && { color }),
      ...(brand && { brand }),
      ...(size && { size }),
      ...(babySize && { babySize }),
      ...(childSize && { childSize }),
      ...(adultSize && { adultSize }),
      ...(owner && { owner }),
      ...(creationDate && { creationDate: new Date(creationDate) }),
      ...(perishable !== undefined && { perishable: perishable === 'true' }),
      ...(published !== undefined && { published: published === 'true' }),
      ...(images && { images }),
    };

    // Check if at least one field to update
    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    const updatedArticle = await prisma.article.update({
      where: { id: articleId },
      data: dataToUpdate,
    });

    // res.json(updatedArticle);
    res.json(serializeBigInt(updatedArticle));
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') {
      // Prisma error when record not found for update
      return res.status(404).json({ message: 'Article not found' });
    }
    res.status(500).json({ message: 'Error updating article', error });
  }
};

const deleteArticleById = async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    if (isNaN(articleId)) {
      return res.status(400).json({ message: 'Invalid article ID' });
    }

    await prisma.article.delete({
      where: { id: articleId }
    });

    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error(error);
    if (error.code === 'P2025') {
      // Prisma error when record not found for delete
      return res.status(404).json({ message: 'Article not found' });
    }
    res.status(500).json({ message: 'Error deleting article', error });
  }
};

const togglePublishArticle = async (req, res) => {
  try {
    const articleId = BigInt(req.params.id);
    console.log('Parsed article ID:', articleId);

    const { published } = req.body;
    console.log('Published value:', published);

    if (published === undefined) {
      return res.status(400).json({ message: 'Missing "published" field in request body' });
    }

    const isPublished = String(published).toLowerCase() === 'true';
    console.log('Final publish value:', isPublished);

    const updatedArticle = await prisma.article.update({
      where: { id: articleId },
      data: { published: isPublished },
    });

    console.log('Article updated:', updatedArticle);
    res.json(serializeBigInt(updatedArticle));
  } catch (error) {
    console.error('Error in togglePublishArticle:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Article not found' });
    }

    res.status(500).json({ message: 'Failed to update publish status', error });
  }
};



const getUserArticles = async (req, res) => {
  try {
    const username = req.headers['x-user-username']; // secure source

    if (!username) {
      return res.status(400).json({ message: 'Username not found in request.' });
    }

    const articles = await prisma.article.findMany({
      where: {
        owner: username
      }
    });

    res.status(200).json(serializeBigInt(articles));

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving user articles', error });
  }
};

const getAllArticlesSortedByLatest = async (req, res) => {
  try {
    const articles = await prisma.article.findMany({
      orderBy: {
        creationDate: 'desc', // Most recent first
      }
    });

    res.status(200).json(serializeBigInt(articles));
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ message: 'Failed to retrieve articles', error });
  }
};

const getArticlesByUsername = async (req, res) => {
  const { username } = req.params;

  try {
    const articles = await prisma.article.findMany({
      where: {
        owner: username,
      },
      orderBy: {
        creationDate: 'desc', // Optional: show newest first
      }
    });

    res.status(200).json(serializeBigInt(articles));
  } catch (error) {
    console.error('Error fetching articles by username:', error);
    res.status(500).json({ message: 'Failed to retrieve user articles', error });
  }
};

const makeOrUpdateOffer = async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const username = req.user?.username; // comes from token via middleware

  if (!username) {
    return res.status(401).json({ message: 'Unauthorized: No username in token' });
  }

  try {
    // Get the article
    const article = await prisma.article.findUnique({
      where: { id: BigInt(id) },
    });

    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    // Parse current offers or initialize
    let offers = article.offers || {};
    if (typeof offers === 'string') {
      offers = JSON.parse(offers);
    }

    // Add or update the user's offer
    offers[username] = parseFloat(amount);

    // Save back the updated offers
    const updatedArticle = await prisma.article.update({
      where: { id: BigInt(id) },
      data: {
        offers,
      },
    });

    res.status(200).json({
      message: 'Offer submitted successfully',
      offers: updatedArticle.offers,
    });

  } catch (error) {
    console.error('Offer error:', error);
    res.status(500).json({ message: 'Failed to submit offer', error });
  }
};

module.exports = { createArticle, getArticleById, updateArticleById, deleteArticleById, togglePublishArticle, getUserArticles, getAllArticlesSortedByLatest, getArticlesByUsername, makeOrUpdateOffer };


