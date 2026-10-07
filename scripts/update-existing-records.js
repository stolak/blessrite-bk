const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');

const prisma = new PrismaClient();

async function updateExistingRecords() {
  let connection;
  
  try {
    console.log('🔄 Updating existing records with LiftPay IDs...\n');

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

    // Update existing merchants
    console.log('🏢 Updating existing merchants...');
    const [merchantResult] = await connection.execute(`
      UPDATE Merchant 
      SET liftpayId = generate_liftpay_id('LPM') 
      WHERE liftpayId IS NULL OR liftpayId = ''
    `);
    console.log(`✅ Updated ${merchantResult.affectedRows} merchants`);

    // Update existing buyers
    console.log('👤 Updating existing buyers...');
    const [buyerResult] = await connection.execute(`
      UPDATE Buyer 
      SET liftpayId = generate_liftpay_id('LPB') 
      WHERE liftpayId IS NULL OR liftpayId = ''
    `);
    console.log(`✅ Updated ${buyerResult.affectedRows} buyers`);

    // Show updated records
    console.log('\n📊 Updated records:');
    const [merchants] = await connection.execute(`
      SELECT id, liftpayId, businessName FROM Merchant WHERE liftpayId IS NOT NULL
    `);
    
    const [buyers] = await connection.execute(`
      SELECT id, liftpayId, firstName, lastName FROM Buyer WHERE liftpayId IS NOT NULL
    `);

    console.log('\n🏢 Merchants:');
    merchants.forEach(merchant => {
      console.log(`   ${merchant.liftpayId} - ${merchant.businessName}`);
    });

    console.log('\n👤 Buyers:');
    buyers.forEach(buyer => {
      const name = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Unknown';
      console.log(`   ${buyer.liftpayId} - ${name}`);
    });

    console.log('\n🎉 All existing records updated successfully!');

  } catch (error) {
    console.error('❌ Error updating existing records:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
    await prisma.$disconnect();
  }
}

// Run the update
updateExistingRecords()
  .then(() => {
    console.log('\n✅ Update completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
