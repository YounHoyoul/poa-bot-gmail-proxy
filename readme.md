This project is inspried by the following project:
- https://github.com/jangdokang/POA.git

This is to connect from TradingViewer to Binance.
- TradingView
- Gmail
- Proxy Server / POA Bot
- Binance or other exchange

# Setup Google Cloud Platform
- Create a project in Google Cloud Platform
    - Copy the project ID and save .env file
- Enable Gmail API
    - Move to "APIs & Services"
    - Move to Libraries
    - Search for "Gmail API"
    - Enable the API
- Enalbe Pub/Sub API
    - Move to "APIs & Services"
    - Move to Libraries
    - Search for "Pub/Sub API"
    - Enable the API
- Create Topic
    - Move to "Pub/Sub"
    - Click "Topic" menu
    - Click "Create Topic"
    - Fill in the form
        - Topic name
    - Copy Topic name and save .env file 
- Create Subscription
    - Move to "Pub/Sub"
    - Click "Subscription" menu
    - Click "Create Subscription"
    - Fill in the form
        - Subscription name
        - Link to the topic
    - Copy Subscription name and save .env file
- Create OAuth consent screen
    - Move to "APIs & Services"
    - Move to OAuth Consent Screen
    - Fill in the form
        - Must upload a logo file, unless, you can't complete the process.
    - Save
- Create OAuth credentials
    - Move to "APIs & Services"
    - Click Create Credentials & Select OAuth client ID
    - Select Desktop App
    - Name the app
    - Click Create
    - Move to the detail of the OAuth client ID
    - Download the JSON file as the credentials.json file
- Create a service account
    - Move to "IAM & Admin"
    - Move to Service Accounts
    - Click Create Service Account
    - Fill in the form
        - Service account name. e.g) Gmail PubSub
        - Service account ID  
        - Seervice account description
        - Give the permissions to the service account
    - Move To Keys
    - Click Add Key
    - Download the JSON file as subscriber-credentials.json
- Assign the service account to permissions
    - Move to "IAM & Admin"
    - Move to IAM
    - Click Pencil (Edit Principals)
    - Add Roles
        - Pub/Sub Editor
        - Pub/Sub Subscriber
- Add Principals to Topis
    - Move to "Pub/Sub"
    - Move to Topic
    - Click Pencil and open view permissions
    - Click Add Principal button
        - Fill in the form
        - Principal : gmail-api-push@system.gserviceaccount.com
        - Role : Pub/Sub Publisher

# Steps to set up server/poabot.config
- You need to set up Poabot templage (server/poabot.config)
    - PASSWORD
    - DISCORD_WEBHOOK_URL
    - BINANCE_KEY
    - BINANCE_SECRET
- After you download the credentials.json file, you need to update server/poabot.config with the credentials.json file.
    - path: /root/.credentials.json
- After you download the subscriber-credentials.json file, you need to update server/poabot.config with the subscriber-credentials.json file.
    - path: /root/.subscriber-credentials.json
- In order to get token.json, you need to run the following command:
    - npm run server
    - npm run token
    - When you get the toke in the web page, you can copy the token and paste it in the command line.
- After you generate token.json, you need to update server/poabot.config with the token.json file.
    - path: /root/.token.json
- You need to update `path: /root/.env.proxy`
    - PROJECT_ID
    - SUBSCRIPTION_NAME
    - TOPIC_NAME
- After you set up all in server/poabot.config, you can save in the user-data of your server.