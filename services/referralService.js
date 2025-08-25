const Employee = require('../models/Employee');
const ReferralStats = require('../models/ReferralStats');
const User = require('../models/User');
const Property = require('../models/Property');

class ReferralService {
  
  // Track when a broker lists their first property
  static async trackBrokerFirstProperty(brokerId) {
    try {
      const broker = await User.findById(brokerId);
      if (!broker || broker.userType !== 'broker') {
        return false;
      }

      // Check if this is their first property
      if (broker.isFirstPropertyListed) {
        return false; // Already tracked
      }

      // Mark as first property listed
      broker.isFirstPropertyListed = true;
      broker.firstPropertyDate = new Date();
      await broker.save();

      // If broker was referred, update referral stats
      if (broker.referredBy) {
        const employee = await Employee.findById(broker.referredBy);
        if (employee) {
          const commission = employee.commissionRates.brokerFirstProperty;
          await ReferralStats.updateStats(
            employee._id,
            'broker',
            commission,
            true // This is a first property bonus
          );
          
          console.log(`First property bonus tracked for ${employee.employeeName}: broker ${broker.fullName} listed first property`);
        }
      }

      return true;
    } catch (error) {
      console.error('Error tracking broker first property:', error);
      return false;
    }
  }

  // Get employee performance summary
  static async getEmployeePerformance(employeeId, startDate, endDate) {
    try {
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        throw new Error('Employee not found');
      }

      // Get stats for date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const startYear = start.getFullYear();
      const startMonth = start.getMonth() + 1;
      const endYear = end.getFullYear();
      const endMonth = end.getMonth() + 1;

      const periods = [];
      for (let year = startYear; year <= endYear; year++) {
        const startM = (year === startYear) ? startMonth : 1;
        const endM = (year === endYear) ? endMonth : 12;
        
        for (let month = startM; month <= endM; month++) {
          periods.push(`${year}-${month.toString().padStart(2, '0')}`);
        }
      }

      const stats = await ReferralStats.find({
        employeeId: employeeId,
        period: { $in: periods }
      }).sort({ year: 1, month: 1 });

      // Calculate totals
      const totals = stats.reduce((acc, stat) => {
        acc.usersReferred += stat.usersReferred;
        acc.brokersReferred += stat.brokersReferred;
        acc.brokerFirstProperties += stat.brokerFirstProperties;
        acc.totalEarnings += stat.totalEarnings + stat.bonusEarnings;
        acc.totalPaid += stat.isPaid ? (stat.totalEarnings + stat.bonusEarnings) : 0;
        return acc;
      }, {
        usersReferred: 0,
        brokersReferred: 0,
        brokerFirstProperties: 0,
        totalEarnings: 0,
        totalPaid: 0
      });

      return {
        employee: {
          employeeName: employee.employeeName,
          employeeId: employee.employeeId,
          referralCode: employee.referralCode
        },
        period: {
          start: startDate,
          end: endDate
        },
        totals,
        monthlyBreakdown: stats
      };
    } catch (error) {
      console.error('Error getting employee performance:', error);
      throw error;
    }
  }

  // Get top performers for a period
  static async getTopPerformers(year, month, limit = 10, sortBy = 'totalCommission') {
    try {
      const period = `${year}-${month.toString().padStart(2, '0')}`;
      
      const pipeline = [
        { $match: { period: period } },
        {
          $lookup: {
            from: 'employees',
            localField: 'employeeId',
            foreignField: '_id',
            as: 'employee'
          }
        },
        { $unwind: '$employee' },
        {
          $addFields: {
            totalReferred: { $add: ['$usersReferred', '$brokersReferred'] },
            totalCommission: { $add: ['$totalEarnings', '$bonusEarnings'] },
            employeeName: '$employee.employeeName',
            referralCode: '$employee.referralCode'
          }
        }
      ];

      // Add sorting based on sortBy parameter
      const sortOptions = {};
      switch (sortBy) {
        case 'totalReferred':
          sortOptions.totalReferred = -1;
          sortOptions.totalCommission = -1; // Secondary sort
          break;
        case 'usersReferred':
          sortOptions.usersReferred = -1;
          break;
        case 'brokersReferred':
          sortOptions.brokersReferred = -1;
          break;
        default:
          sortOptions.totalCommission = -1;
          sortOptions.totalReferred = -1; // Secondary sort
      }

      pipeline.push({ $sort: sortOptions });
      pipeline.push({ $limit: limit });
      pipeline.push({
        $project: {
          employeeName: 1,
          referralCode: 1,
          usersReferred: 1,
          brokersReferred: 1,
          brokerFirstProperties: 1,
          totalReferred: 1,
          totalCommission: 1,
          isPaid: 1,
          rank: { $add: [{ $indexOfArray: [[], '$_id'] }, 1] }
        }
      });

      const topPerformers = await ReferralStats.aggregate(pipeline);
      return topPerformers;
    } catch (error) {
      console.error('Error getting top performers:', error);
      throw error;
    }
  }

  // Calculate commission for an employee for a specific month
  static async calculateMonthlyCommission(employeeId, year, month) {
    try {
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        throw new Error('Employee not found');
      }

      const period = `${year}-${month.toString().padStart(2, '0')}`;
      const stats = await ReferralStats.findOne({ employeeId, period });

      if (!stats) {
        return {
          baseCommission: 0,
          bonusCommission: 0,
          totalCommission: 0,
          breakdown: {
            usersReferred: 0,
            brokersReferred: 0,
            brokerFirstProperties: 0,
            userTargetMet: false,
            brokerTargetMet: false
          }
        };
      }

      const rates = employee.commissionRates;
      
      // Base commissions
      const userCommission = stats.usersReferred * rates.userRegistration;
      const brokerCommission = stats.brokersReferred * rates.brokerRegistration;
      const firstPropertyBonus = stats.brokerFirstProperties * rates.brokerFirstProperty;
      const baseCommission = userCommission + brokerCommission + firstPropertyBonus;

      // Bonus commissions
      let bonusCommission = 0;
      const userTargetMet = stats.usersReferred >= rates.monthlyBonus.userTarget.achievement;
      const brokerTargetMet = stats.brokersReferred >= rates.monthlyBonus.brokerTarget.achievement;

      if (userTargetMet) {
        bonusCommission += rates.monthlyBonus.userTarget.bonus;
      }
      if (brokerTargetMet) {
        bonusCommission += rates.monthlyBonus.brokerTarget.bonus;
      }

      const totalCommission = baseCommission + bonusCommission;

      return {
        baseCommission,
        bonusCommission,
        totalCommission,
        breakdown: {
          usersReferred: stats.usersReferred,
          brokersReferred: stats.brokersReferred,
          brokerFirstProperties: stats.brokerFirstProperties,
          userTargetMet,
          brokerTargetMet,
          commissionBreakdown: {
            userCommission,
            brokerCommission,
            firstPropertyBonus
          }
        }
      };
    } catch (error) {
      console.error('Error calculating monthly commission:', error);
      throw error;
    }
  }

  // Mark payments as paid
  static async markPaymentsPaid(employeeId, year, month, paidAmount, paymentReference) {
    try {
      const period = `${year}-${month.toString().padStart(2, '0')}`;
      
      const result = await ReferralStats.findOneAndUpdate(
        { employeeId, period },
        {
          isPaid: true,
          paidDate: new Date(),
          paidAmount: paidAmount,
          paymentReference: paymentReference || ''
        },
        { new: true }
      );

      if (!result) {
        throw new Error('Referral stats not found for the specified period');
      }

      return result;
    } catch (error) {
      console.error('Error marking payments as paid:', error);
      throw error;
    }
  }

  // Get unpaid commissions summary
  static async getUnpaidCommissions() {
    try {
      const unpaidStats = await ReferralStats.aggregate([
        { $match: { isPaid: false, $expr: { $gt: [{ $add: ['$totalEarnings', '$bonusEarnings'] }, 0] } } },
        {
          $lookup: {
            from: 'employees',
            localField: 'employeeId',
            foreignField: '_id',
            as: 'employee'
          }
        },
        { $unwind: '$employee' },
        {
          $addFields: {
            totalCommission: { $add: ['$totalEarnings', '$bonusEarnings'] },
            employeeName: '$employee.employeeName',
            referralCode: '$employee.referralCode'
          }
        },
        {
          $group: {
            _id: '$employeeId',
            employeeName: { $first: '$employeeName' },
            referralCode: { $first: '$referralCode' },
            totalUnpaid: { $sum: '$totalCommission' },
            unpaidPeriods: {
              $push: {
                period: '$period',
                amount: '$totalCommission',
                usersReferred: '$usersReferred',
                brokersReferred: '$brokersReferred'
              }
            }
          }
        },
        { $sort: { totalUnpaid: -1 } }
      ]);

      const summary = unpaidStats.reduce((acc, emp) => {
        acc.totalAmount += emp.totalUnpaid;
        acc.employeeCount += 1;
        return acc;
      }, { totalAmount: 0, employeeCount: 0 });

      return {
        summary,
        employees: unpaidStats
      };
    } catch (error) {
      console.error('Error getting unpaid commissions:', error);
      throw error;
    }
  }

  // Get referral analytics
  static async getReferralAnalytics(startDate, endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Get all referrals in the period
      const referrals = await User.find({
        referredBy: { $exists: true, $ne: null },
        referralDate: { $gte: start, $lte: end }
      }).populate('referredBy', 'employeeName referralCode');

      // Group by employee and user type
      const analytics = referrals.reduce((acc, user) => {
        const employeeId = user.referredBy._id.toString();
        
        if (!acc[employeeId]) {
          acc[employeeId] = {
            employee: {
              name: user.referredBy.employeeName,
              referralCode: user.referredBy.referralCode
            },
            users: 0,
            brokers: 0,
            total: 0
          };
        }

        if (user.userType === 'broker') {
          acc[employeeId].brokers++;
        } else {
          acc[employeeId].users++;
        }
        acc[employeeId].total++;

        return acc;
      }, {});

      // Convert to array and sort by total
      const analyticsArray = Object.values(analytics).sort((a, b) => b.total - a.total);

      const summary = {
        totalReferrals: referrals.length,
        totalUsers: referrals.filter(r => r.userType !== 'broker').length,
        totalBrokers: referrals.filter(r => r.userType === 'broker').length,
        activeEmployees: analyticsArray.length
      };

      return {
        summary,
        employeeBreakdown: analyticsArray
      };
    } catch (error) {
      console.error('Error getting referral analytics:', error);
      throw error;
    }
  }
}

module.exports = ReferralService;