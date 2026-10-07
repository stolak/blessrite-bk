require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Try to import from dist (production build) or use ts-node for development
let accountDetailsService;
try {
  // Try compiled version first
  accountDetailsService = require('../dist/services/accountDetailsService').accountDetailsService;
} catch (error) {
  try {
    // Fallback to TypeScript source (requires ts-node)
    require('ts-node/register');
    accountDetailsService = require('../src/services/accountDetailsService').accountDetailsService;
  } catch (tsError) {
    console.error('❌ Error: Could not load accountDetailsService');
    console.error('   Make sure you have either:');
    console.error('   1. Built the project: npm run build');
    console.error('   2. Or have ts-node installed for development');
    process.exit(1);
  }
}

const prisma = new PrismaClient();

/**
 * Test script for validateAndCreateAccount method
 * 
 * Usage:
 *   node scripts/test-validate-and-create-account.js <accountId> <buyerId>
 * 
 * Example:
 *   node scripts/test-validate-and-create-account.js acc_123456789 buyer-uuid-here
 */

async function testValidateAndCreateAccount() {
  try {
    console.log('🧪 Testing validateAndCreateAccount Method...\n');

    // Get arguments from command line
    const accountId = process.argv[2];
    const buyerId = process.argv[3];

    if (!accountId) {
      console.error('❌ Error: accountId is required');
      console.log('\nUsage: node scripts/test-validate-and-create-account.js <accountId> <buyerId>');
      console.log('Example: node scripts/test-validate-and-create-account.js acc_123456789 buyer-uuid-here\n');
      process.exit(1);
    }

    if (!buyerId) {
      console.error('❌ Error: buyerId is required');
      console.log('\nUsage: node scripts/test-validate-and-create-account.js <accountId> <buyerId>');
      console.log('Example: node scripts/test-validate-and-create-account.js acc_123456789 buyer-uuid-here\n');
      process.exit(1);
    }

    // Check environment variables
    console.log('📋 Environment Check:');
    if (!process.env.MONO_SECRET_KEY) {
      console.error('   ❌ MONO_SECRET_KEY is not set');
      process.exit(1);
    } else {
      console.log('   ✅ MONO_SECRET_KEY is set');
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn('   ⚠️  OPENAI_API_KEY is not set (bank statement analysis will fail)');
    } else {
      console.log('   ✅ OPENAI_API_KEY is set');
    }
    console.log('');

    // Verify buyer exists in database
    console.log('🔍 Verifying Buyer:');
    const buyer = await prisma.buyer.findUnique({
      where: { id: buyerId },
      select: {
        id: true,
        liftpayId: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!buyer) {
      console.error(`   ❌ Buyer with ID "${buyerId}" not found in database`);
      process.exit(1);
    } else {
      console.log(`   ✅ Buyer found: ${buyer.firstName || ''} ${buyer.lastName || ''}`.trim());
      console.log(`      ID: ${buyer.id}`);
      console.log(`      LiftPay ID: ${buyer.liftpayId}`);
      console.log(`      Email: ${buyer.email}`);
    }
    console.log('');

    // Test Step 1: Get Mono Account
    console.log('📊 Step 1: Getting Mono Account...');
    console.log(`   Account ID: ${accountId}`);
    
    const accountResult = await accountDetailsService.getMonoAccountById(accountId);
    
    if (!accountResult.success) {
      console.error(`   ❌ Failed to get account: ${accountResult.error}`);
      console.log('\n💡 Tips:');
      console.log('   - Verify the account ID is correct');
      console.log('   - Check that MONO_SECRET_KEY is valid');
      console.log('   - Ensure the account exists in Mono');
      process.exit(1);
    }

    const accountData = accountResult.data.data;
    console.log('   ✅ Account retrieved successfully');
    console.log(`      Account Name: ${accountData.name || 'N/A'}`);
    console.log(`      Account Number: ${accountData.accountNumber || 'N/A'}`);
    console.log(`      Bank: ${accountData.institution?.name || 'N/A'}`);
    console.log(`      Customer ID: ${accountData.customer?.id || 'N/A'}`);
    console.log('');

    // Test Step 2: Get Customer
    if (!accountData.customer?.id) {
      console.error('   ❌ Account data does not contain customer ID');
      process.exit(1);
    }

    console.log('👤 Step 2: Getting Mono Customer...');
    console.log(`   Customer ID: ${accountData.customer.id}`);
    
    const customerResult = await accountDetailsService.getMonoCustomerById(accountData.customer.id);
    
    if (!customerResult.success) {
      console.error(`   ❌ Failed to get customer: ${customerResult.error}`);
      process.exit(1);
    }

    const customerData = customerResult.data.data;
    console.log('   ✅ Customer retrieved successfully');
    console.log(`      Name: ${customerData.first_name || ''} ${customerData.last_name || ''}`.trim());
    console.log(`      Email: ${customerData.email || 'N/A'}`);
    console.log(`      Phone: ${customerData.phone || 'N/A'}`);
    console.log('');

    // Test Step 3: Get Account Statement
    console.log('📄 Step 3: Getting Account Statement...');
    
    const statementResult = await accountDetailsService.getStatement(accountId);
    
    if (!statementResult.success) {
      console.error(`   ❌ Failed to get statement: ${statementResult.error}`);
      process.exit(1);
    }

    const statementData = statementResult.data.data;
    const transactions = Array.isArray(statementData) ? statementData : statementData.transactions || [];
    console.log('   ✅ Statement retrieved successfully');
    console.log(`      Transactions count: ${transactions.length}`);
    
    if (transactions.length > 0) {
      console.log(`      First transaction date: ${transactions[0].date || 'N/A'}`);
      console.log(`      Last transaction date: ${transactions[transactions.length - 1].date || 'N/A'}`);
    }
    console.log('');

    // Test Step 4: Run Full Validation
    console.log('🔄 Step 4: Running Full Validation (validateAndCreateAccount)...');
    console.log(`   Account ID: ${accountId}`);
    console.log(`   Buyer ID: ${buyerId}`);
    console.log('');

    const startTime = Date.now();
    const result = await accountDetailsService.validateAndCreateAccount(accountId, buyerId);
    const duration = Date.now() - startTime;

    if (!result.success) {
      console.error(`   ❌ Validation failed: ${result.error}`);
      console.log('\n💡 Possible issues:');
      console.log('   - Account ID might be invalid');
      console.log('   - Customer might not exist in Mono');
      console.log('   - Statement might not be available');
      console.log('   - OpenAI API key might be invalid or missing');
      console.log('   - Network connectivity issues');
      process.exit(1);
    }

    console.log(`   ✅ Validation completed successfully (${duration}ms)`);
    console.log('');

    // Display Analysis Results
    if (result.data && result.data.success) {
      const analysis = result.data.data;
      console.log('📊 Bank Statement Analysis Results:');
      console.log('   ┌─────────────────────────────────────────────────┐');
      console.log(`   │ Employment Type: ${String(analysis.EmploymentType || 'N/A').padEnd(30)} │`);
      console.log(`   │ Monthly Salary: ${String(analysis.MonthlySalary || 'N/A').padEnd(31)} │`);
      console.log(`   │ Average Monthly Income: ${String(analysis.AverageMonthlyIncome || 'N/A').padEnd(20)} │`);
      console.log(`   │ Months in Current Work: ${String(analysis.NumberOfMonthsInCurrentPlaceOfWork || 'N/A').padEnd(21)} │`);
      console.log(`   │ Number of Overdrafts: ${String(analysis.NumberOfOverdraft || 'N/A').padEnd(23)} │`);
      console.log(`   │ Average Account Balance: ${String(analysis.AverageAccountBalance || 'N/A').padEnd(20)} │`);
      console.log(`   │ Total Loan Repayment: ${String(analysis.TotalExistingLoanRepayment || 'N/A').padEnd(24)} │`);
      console.log(`   │ Current Balance: ${String(analysis.CurrentBalance || 'N/A').padEnd(28)} │`);
      console.log('   └─────────────────────────────────────────────────┘');
    } else if (result.data && !result.data.success) {
      console.error('   ❌ Analysis failed:', result.data.error);
    } else {
      console.log('   ⚠️  Analysis data not available');
    }

    console.log('\n✅ All tests passed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Account validated: ✅`);
    console.log(`   - Customer validated: ✅`);
    console.log(`   - Statement retrieved: ✅`);
    console.log(`   - Analysis completed: ${result.data && result.data.success ? '✅' : '❌'}`);
    console.log(`   - Total duration: ${duration}ms`);

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testValidateAndCreateAccount()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });

