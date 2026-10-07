const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');

const prisma = new PrismaClient();

async function fixSequenceIssue() {
  let connection;
  
  try {
    console.log('🔍 Diagnosing LiftPay ID sequence issue...\n');

    // Get database connection details from Prisma
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found in environment variables');
    }

    // Parse the database URL
    const url = new URL(databaseUrl);
    const config = {
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
      multipleStatements: true
    };

    console.log(`📡 Connecting to database: ${config.database}@${config.host}:${config.port}`);
    connection = await mysql.createConnection(config);

    // Check current sequences
    console.log('📊 Current sequence table:');
    const [sequences] = await connection.execute(`
      SELECT prefix, \`year_month\`, seq FROM liftpay_sequence ORDER BY prefix, \`year_month\`
    `);
    
    if (sequences.length > 0) {
      sequences.forEach(seq => {
        console.log(`   ${seq.prefix} - ${seq.year_month}: ${seq.seq}`);
      });
    } else {
      console.log('   No sequences found');
    }

    // Check existing merchants and their liftpayIds
    console.log('\n🏢 Existing merchants:');
    const [merchants] = await connection.execute(`
      SELECT id, liftpayId, businessName FROM Merchant ORDER BY createdAt
    `);
    
    merchants.forEach(merchant => {
      console.log(`   ${merchant.liftpayId} - ${merchant.businessName}`);
    });

    // Check existing buyers and their liftpayIds
    console.log('\n👤 Existing buyers:');
    const [buyers] = await connection.execute(`
      SELECT id, liftpayId, firstName, lastName FROM Buyer ORDER BY createdAt
    `);
    
    buyers.forEach(buyer => {
      const name = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Unknown';
      console.log(`   ${buyer.liftpayId} - ${name}`);
    });

    // Check for duplicate liftpayIds
    console.log('\n🔍 Checking for duplicate liftpayIds...');
    const [duplicateMerchants] = await connection.execute(`
      SELECT liftpayId, COUNT(*) as count 
      FROM Merchant 
      WHERE liftpayId IS NOT NULL AND liftpayId != ''
      GROUP BY liftpayId 
      HAVING COUNT(*) > 1
    `);

    const [duplicateBuyers] = await connection.execute(`
      SELECT liftpayId, COUNT(*) as count 
      FROM Buyer 
      WHERE liftpayId IS NOT NULL AND liftpayId != ''
      GROUP BY liftpayId 
      HAVING COUNT(*) > 1
    `);

    if (duplicateMerchants.length > 0) {
      console.log('❌ Found duplicate merchant liftpayIds:');
      duplicateMerchants.forEach(dup => {
        console.log(`   ${dup.liftpayId}: ${dup.count} occurrences`);
      });
    }

    if (duplicateBuyers.length > 0) {
      console.log('❌ Found duplicate buyer liftpayIds:');
      duplicateBuyers.forEach(dup => {
        console.log(`   ${dup.liftpayId}: ${dup.count} occurrences`);
      });
    }

    if (duplicateMerchants.length === 0 && duplicateBuyers.length === 0) {
      console.log('✅ No duplicate liftpayIds found');
    }

    // Test the function
    console.log('\n🧪 Testing generate_liftpay_id function...');
    try {
      const [testResult] = await connection.execute(`SELECT generate_liftpay_id('LPM') as test_id`);
      console.log(`✅ Function test result: ${testResult[0].test_id}`);
    } catch (error) {
      console.log(`❌ Function test failed: ${error.message}`);
    }

    // Check if we need to reset sequences
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const currentYearMonth = `${currentYear}${currentMonth}`;

    console.log(`\n📅 Current year-month: ${currentYearMonth}`);

    // Find the highest sequence for each prefix
    const [maxSequences] = await connection.execute(`
      SELECT prefix, MAX(CAST(SUBSTRING(liftpayId, LENGTH(prefix) + 2 + 5) AS UNSIGNED)) as max_seq
      FROM (
        SELECT 'LPM' as prefix, liftpayId FROM Merchant WHERE liftpayId IS NOT NULL AND liftpayId != ''
        UNION ALL
        SELECT 'LPB' as prefix, liftpayId FROM Buyer WHERE liftpayId IS NOT NULL AND liftpayId != ''
      ) as all_ids
      WHERE liftpayId LIKE CONCAT(prefix, '-', '${currentYearMonth}', '-%')
      GROUP BY prefix
    `);

    console.log('\n📈 Current max sequences in use:');
    maxSequences.forEach(max => {
      console.log(`   ${max.prefix}: ${max.max_seq || 'None'}`);
    });

    // Update sequence table to be higher than current max
    for (const max of maxSequences) {
      if (max.max_seq) {
        const newSeq = Math.max(max.max_seq + 1, 100001);
        console.log(`\n🔄 Updating ${max.prefix} sequence to ${newSeq}...`);
        
        await connection.execute(`
          INSERT INTO liftpay_sequence (prefix, \`year_month\`, seq)
          VALUES ('${max.prefix}', '${currentYearMonth}', ${newSeq})
          ON DUPLICATE KEY UPDATE seq = ${newSeq}
        `);
        
        console.log(`✅ Updated ${max.prefix} sequence to ${newSeq}`);
      }
    }

    // Final test
    console.log('\n🧪 Final test - generating new IDs...');
    const [finalTestMerchant] = await connection.execute(`SELECT generate_liftpay_id('LPM') as test_id`);
    const [finalTestBuyer] = await connection.execute(`SELECT generate_liftpay_id('LPB') as test_id`);
    
    console.log(`✅ New Merchant ID: ${finalTestMerchant[0].test_id}`);
    console.log(`✅ New Buyer ID: ${finalTestBuyer[0].test_id}`);

    console.log('\n🎉 Sequence issue diagnosis and fix completed!');

  } catch (error) {
    console.error('❌ Error fixing sequence issue:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
    await prisma.$disconnect();
  }
}

// Run the fix
fixSequenceIssue()
  .then(() => {
    console.log('\n✅ Fix completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fix failed:', error);
    process.exit(1);
  });
