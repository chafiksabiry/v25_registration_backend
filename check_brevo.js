
import axios from 'axios';

const API_KEY = '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';

async function checkSenders() {
    try {
        const response = await axios.get('https://api.brevo.com/v3/senders', {
            headers: {
                'api-key': API_KEY,
                'accept': 'application/json'
            }
        });
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching senders:', error.response ? error.response.data : error.message);
    }
}

checkSenders();
