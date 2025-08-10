// services/transactionService.js
const prisma = require('../prismaClient');
const NotificationService = require('./notificationService');
const { serializeBigInt } = require('../utils/helpers');

class TransactionService {
  /**
   * Clean up expired transactions (payment pending for more than 24 hours)
   */
  static async cleanupExpiredTransactions() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Find expired transactions
      const expiredTransactions = await prisma.transaction.findMany({
        where: {
          status: 'PAYMENT_PENDING',
          createdDate: {
            lt: twentyFourHoursAgo
          }
        },
        include: {
          offer: {
            include: {
              article: true
            }
          }
        }
      });

      if (expiredTransactions.length === 0) {
        console.log('No expired transactions found');
        return;
      }

      console.log(`Found ${expiredTransactions.length} expired transactions`);

      for (const transaction of expiredTransactions) {
        // Update transaction status
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'CANCELLED',
            updatedDate: new Date()
          }
        });

        // Update offer back to ACCEPTED if it was in DONE status
        if (transaction.offer.status === 'DONE') {
          await prisma.offer.update({
            where: { id: transaction.offerId },
            data: {
              status: 'ACCEPTED',
              updatedDate: new Date()
            }
          });
        }

        // Notify both parties
        await NotificationService.createNotification({
          userId: transaction.buyerUsername,
          type: 'TRANSACTION_CANCELLED',
          title: 'Transaction Expired',
          message: `Your transaction for "${transaction.offer.articleName}" has been cancelled due to payment timeout.`,
          data: {
            transactionId: transaction.id.toString(),
            reason: 'payment_timeout'
          }
        });

        await NotificationService.createNotification({
          userId: transaction.sellerUsername,
          type: 'TRANSACTION_CANCELLED',
          title: 'Transaction Expired',
          message: `Transaction for "${transaction.offer.articleName}" has been cancelled due to buyer payment timeout.`,
          data: {
            transactionId: transaction.id.toString(),
            reason: 'payment_timeout'
          }
        });
      }

      console.log(`Cleaned up ${expiredTransactions.length} expired transactions`);
    } catch (error) {
      console.error('Error cleaning up expired transactions:', error);
      throw error;
    }
  }

  /**
   * Auto-complete transactions that have been shipped for more than 7 days
   * without buyer confirmation (simulate auto-release)
   */
  static async autoCompleteShippedTransactions() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const shippedTransactions = await prisma.transaction.findMany({
        where: {
          status: 'SHIPPED',
          shippedAt: {
            lt: sevenDaysAgo
          }
        },
        include: {
          offer: {
            include: {
              article: true
            }
          }
        }
      });

      if (shippedTransactions.length === 0) {
        console.log('No shipped transactions to auto-complete');
        return;
      }

      console.log(`Auto-completing ${shippedTransactions.length} shipped transactions`);

      for (const transaction of shippedTransactions) {
        // Generate release reference
        const releaseReference = `AUTO_REL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Update transaction
        const updatedTransaction = await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'COMPLETED',
            deliveryConfirmedAt: new Date(),
            paymentReleasedAt: new Date(),
            paymentReleaseReference: releaseReference,
            updatedDate: new Date()
          }
        });

        // Mark article as bought
        await prisma.article.update({
          where: { id: transaction.articleId },
          data: {
            boughtBy: transaction.buyerUsername,
            published: false,
            updatedDate: new Date()
          }
        });

        // Notify seller
        await NotificationService.createNotification({
          userId: transaction.sellerUsername,
          type: 'PAYMENT_RELEASED',
          title: 'Payment Auto-Released',
          message: `Payment of $${transaction.amount} has been automatically released for "${transaction.offer.articleName}" after 7 days.`,
          data: {
            transactionId: transaction.id.toString(),
            amount: transaction.amount,
            releaseReference,
            autoReleased: true
          }
        });

        // Notify buyer
        await NotificationService.createNotification({
          userId: transaction.buyerUsername,
          type: 'TRANSACTION_COMPLETED',
          title: 'Transaction Auto-Completed',
          message: `Your purchase of "${transaction.offer.articleName}" has been automatically completed after 7 days.`,
          data: {
            transactionId: transaction.id.toString(),
            autoCompleted: true
          }
        });
      }

      console.log(`Auto-completed ${shippedTransactions.length} transactions`);
    } catch (error) {
      console.error('Error auto-completing shipped transactions:', error);
      throw error;
    }
  }

  /**
   * Get transaction statistics for a user
   */
  static async getUserTransactionStats(username) {
    try {
      const [buyerStats, sellerStats] = await Promise.all([
        // As buyer
        prisma.transaction.groupBy({
          by: ['status'],
          where: { buyerUsername: username },
          _count: { status: true }
        }),
        // As seller
        prisma.transaction.groupBy({
          by: ['status'],
          where: { sellerUsername: username },
          _count: { status: true }
        })
      ]);

      const [totalAsBuyer, totalAsSeller, totalSpent, totalEarned] = await Promise.all([
        prisma.transaction.count({
          where: { buyerUsername: username }
        }),
        prisma.transaction.count({
          where: { sellerUsername: username }
        }),
        prisma.transaction.aggregate({
          where: {
            buyerUsername: username,
            status: 'COMPLETED'
          },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: {
            sellerUsername: username,
            status: 'COMPLETED'
          },
          _sum: { amount: true }
        })
      ]);

      return {
        buyer: {
          total: totalAsBuyer,
          byStatus: buyerStats.reduce((acc, stat) => {
            acc[stat.status] = stat._count.status;
            return acc;
          }, {}),
          totalSpent: totalSpent._sum.amount || 0
        },
        seller: {
          total: totalAsSeller,
          byStatus: sellerStats.reduce((acc, stat) => {
            acc[stat.status] = stat._count.status;
            return acc;
          }, {}),
          totalEarned: totalEarned._sum.amount || 0
        }
      };
    } catch (error) {
      console.error('Error getting user transaction stats:', error);
      throw error;
    }
  }

  /**
   * Calculate platform statistics
   */
  static async getPlatformStats() {
    try {
      const [
        totalTransactions,
        completedTransactions,
        disputedTransactions,
        totalVolume,
        avgTransactionValue
      ] = await Promise.all([
        prisma.transaction.count(),
        prisma.transaction.count({
          where: { status: 'COMPLETED' }
        }),
        prisma.transaction.count({
          where: { status: 'DISPUTED' }
        }),
        prisma.transaction.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { status: 'COMPLETED' },
          _avg: { amount: true }
        })
      ]);

      // Get transaction volume by month (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const monthlyVolume = await prisma.$queryRaw`
        SELECT 
          DATE_FORMAT(createdDate, '%Y-%m') as month,
          COUNT(*) as count,
          SUM(amount) as volume
        FROM Transaction 
        WHERE createdDate >= ${twelveMonthsAgo}
          AND status = 'COMPLETED'
        GROUP BY DATE_FORMAT(createdDate, '%Y-%m')
        ORDER BY month ASC
      `;

      return {
        totalTransactions,
        completedTransactions,
        disputedTransactions,
        successRate: totalTransactions > 0 ? (completedTransactions / totalTransactions * 100).toFixed(2) : 0,
        disputeRate: totalTransactions > 0 ? (disputedTransactions / totalTransactions * 100).toFixed(2) : 0,
        totalVolume: totalVolume._sum.amount || 0,
        avgTransactionValue: avgTransactionValue._avg.amount || 0,
        monthlyVolume: serializeBigInt(monthlyVolume)
      };
    } catch (error) {
      console.error('Error getting platform stats:', error);
      throw error;
    }
  }

  /**
   * Simulate payment processing (replace with actual payment gateway)
   */
  static async simulatePaymentProcessing(transactionId, amount) {
    return new Promise((resolve, reject) => {
      // Simulate processing time (1-5 seconds)
      const processingTime = Math.random() * 4000 + 1000;
      
      setTimeout(() => {
        // Simulate 95% success rate
        const success = Math.random() < 0.95;
        
        if (success) {
          resolve({
            success: true,
            reference: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            amount,
            processedAt: new Date()
          });
        } else {
          reject(new Error('Payment processing failed'));
        }
      }, processingTime);
    });
  }

  /**
   * Simulate payment release (replace with actual payment gateway)
   */
  static async simulatePaymentRelease(transactionId, amount, sellerUsername) {
    return new Promise((resolve) => {
      // Simulate release processing time
      const processingTime = Math.random() * 2000 + 500;
      
      setTimeout(() => {
        resolve({
          success: true,
          reference: `REL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount,
          recipient: sellerUsername,
          releasedAt: new Date()
        });
      }, processingTime);
    });
  }

  /**
   * Check for suspicious transactions
   */
  static async detectSuspiciousActivity(username) {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [
        recentTransactions,
        recentDisputes,
        highValueTransactions
      ] = await Promise.all([
        prisma.transaction.count({
          where: {
            OR: [
              { buyerUsername: username },
              { sellerUsername: username }
            ],
            createdDate: { gte: last24Hours }
          }
        }),
        prisma.transaction.count({
          where: {
            OR: [
              { buyerUsername: username },
              { sellerUsername: username }
            ],
            status: 'DISPUTED',
            createdDate: { gte: last24Hours }
          }
        }),
        prisma.transaction.count({
          where: {
            OR: [
              { buyerUsername: username },
              { sellerUsername: username }
            ],
            amount: { gte: 1000 }, // Transactions over $1000
            createdDate: { gte: last24Hours }
          }
        })
      ]);

      const flags = [];
      
      if (recentTransactions > 20) {
        flags.push('HIGH_TRANSACTION_VOLUME');
      }
      
      if (recentDisputes > 3) {
        flags.push('HIGH_DISPUTE_RATE');
      }
      
      if (highValueTransactions > 5) {
        flags.push('HIGH_VALUE_TRANSACTIONS');
      }

      return {
        suspicious: flags.length > 0,
        flags,
        metrics: {
          recentTransactions,
          recentDisputes,
          highValueTransactions
        }
      };
    } catch (error) {
      console.error('Error detecting suspicious activity:', error);
      throw error;
    }
  }
}

module.exports = TransactionService;