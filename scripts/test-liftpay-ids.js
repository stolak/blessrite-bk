const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testLiftPayIds() {
  try {
    console.log('🧪 Testing LiftPay ID System...\n');

    // Test 1: Check existing merchants
    console.log('📊 Existing Merchants:');
    const merchants = await prisma.merchant.findMany({
      select: {
        liftpayId: true,
        businessName: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    merchants.forEach((merchant, index) => {
      console.log(`   ${index + 1}. ${merchant.liftpayId} - ${merchant.businessName}`);
    });

    // Test 2: Check existing buyers
    console.log('\n📊 Existing Buyers:');
    const buyers = await prisma.buyer.findMany({
      select: {
        liftpayId: true,
        firstName: true,
        lastName: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    buyers.forEach((buyer, index) => {
      const name = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || 'Unknown';
      console.log(`   ${index + 1}. ${buyer.liftpayId} - ${name}`);
    });

    // Test 3: Check sequence table
    console.log('\n📊 Sequence Table:');
    const sequences = await prisma.$queryRaw`
      SELECT prefix, \`year_month\`, seq 
      FROM liftpay_sequence 
      ORDER BY prefix, \`year_month\`
    `;

    sequences.forEach(seq => {
      console.log(`   ${seq.prefix} - ${seq.year_month}: ${seq.seq}`);
    });

    // Test 4: Validate ID formats
    console.log('\n🔍 Validating ID Formats:');
    
    const merchantIds = merchants.map(m => m.liftpayId).filter(Boolean);
    const buyerIds = buyers.map(b => b.liftpayId).filter(Boolean);
    
    const allIds = [...merchantIds, ...buyerIds];
    
    allIds.forEach(id => {
      const isValid = /^LPM-\d{4}-\d{6}$|^LPB-\d{4}-\d{6}$/.test(id);
      console.log(`   ${id}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    });

    // Test 5: Check for duplicates
    console.log('\n🔍 Checking for Duplicates:');
    const merchantIdCounts = {};
    const buyerIdCounts = {};
    
    merchantIds.forEach(id => {
      merchantIdCounts[id] = (merchantIdCounts[id] || 0) + 1;
    });
    
    buyerIds.forEach(id => {
      buyerIdCounts[id] = (buyerIdCounts[id] || 0) + 1;
    });

    const duplicateMerchants = Object.entries(merchantIdCounts).filter(([id, count]) => count > 1);
    const duplicateBuyers = Object.entries(buyerIdCounts).filter(([id, count]) => count > 1);

    if (duplicateMerchants.length > 0) {
      console.log('   ❌ Duplicate Merchant IDs:');
      duplicateMerchants.forEach(([id, count]) => {
        console.log(`      ${id}: ${count} occurrences`);
      });
    } else {
      console.log('   ✅ No duplicate merchant IDs found');
    }

    if (duplicateBuyers.length > 0) {
      console.log('   ❌ Duplicate Buyer IDs:');
      duplicateBuyers.forEach(([id, count]) => {
        console.log(`      ${id}: ${count} occurrences`);
      });
    } else {
      console.log('   ✅ No duplicate buyer IDs found');
    }

    // Test 6: Test ID generation function
    console.log('\n🧪 Testing ID Generation:');
    try {
      const [testMerchant] = await prisma.$queryRaw`SELECT generate_liftpay_id('LPM') as test_id`;
      const [testBuyer] = await prisma.$queryRaw`SELECT generate_liftpay_id('LPB') as test_id`;
      
      console.log(`   New Merchant ID: ${testMerchant.test_id}`);
      console.log(`   New Buyer ID: ${testBuyer.test_id}`);
      
      // Validate generated IDs
      const merchantValid = /^LPM-\d{4}-\d{6}$/.test(testMerchant.test_id);
      const buyerValid = /^LPB-\d{4}-\d{6}$/.test(testBuyer.test_id);
      
      console.log(`   Merchant ID Valid: ${merchantValid ? '✅' : '❌'}`);
      console.log(`   Buyer ID Valid: ${buyerValid ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log(`   ❌ ID Generation Test Failed: ${error.message}`);
    }

    console.log('\n🎉 LiftPay ID System Test Completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testLiftPayIds()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });
