const { createClient } = require("@sanity/client");

// Initialize the Sanity client
const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID, // replace with your project ID
  dataset: process.env.SANITY_DATASET, // replace with your dataset name
  apiVersion: "2021-08-31",
  useCdn: false, // `false` if you want to ensure fresh data
  token: process.env.SANITY_TOKEN, // replace with your write token
});

module.exports = sanityClient;
