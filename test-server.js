const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testServer() {
  console.log('🧪 Testing Read Later API Server...\n');

  const tests = [
    {
      name: 'Health Check',
      url: `${BASE_URL}/api/health`,
      method: 'GET'
    },
    {
      name: 'Root Endpoint',
      url: `${BASE_URL}/`,
      method: 'GET'
    },
    {
      name: 'Get All Articles',
      url: `${BASE_URL}/api/articles`,
      method: 'GET'
    },
    {
      name: 'Test Article Creation (Mock)',
      url: `${BASE_URL}/api/articles`,
      method: 'POST',
      data: {
        url: 'https://example.com/test-article',
        title: 'Test Article',
        content: '<p>This is a test article content.</p>',
        excerpt: 'This is a test article for API testing.',
        author: 'Test Author',
        domain: 'example.com',
        tags: ['test', 'api'],
        reading_time: 2
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}...`);
      
      const config = {
        method: test.method,
        url: test.url,
        timeout: 5000,
        ...(test.data && { data: test.data })
      };

      const response = await axios(config);
      
      if (response.status >= 200 && response.status < 300) {
        console.log(`✅ ${test.name} - Status: ${response.status}`);
        if (response.data) {
          console.log(`   Response: ${JSON.stringify(response.data, null, 2).substring(0, 200)}...`);
        }
        passed++;
      } else {
        console.log(`❌ ${test.name} - Status: ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
      failed++;
    }
    console.log('');
  }

  console.log('📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Server is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check server logs for details.');
  }
}

// Run tests
testServer().catch(error => {
  console.error('❌ Test runner failed:', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.log('\n💡 Make sure the server is running on http://localhost:3000');
    console.log('   Run: npm start (or npm run dev) in the backend directory');
  }
  process.exit(1);
});