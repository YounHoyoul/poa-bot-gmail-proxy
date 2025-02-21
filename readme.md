This project is inspried by the following project:
- https://github.com/YounHoyoul/poa-bot-gmail-proxy.git

This is to connect from TradingViewer to Binance.
    - TradingView
    - Gmail
    - Proxy Server / POA Bot
    - Binance or other exchange

# Setup Google Cloud Platform

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
- You can follow the instructions in the terminal.
- After you generate token.json, you need to update server/poabot.config with the token.json file.
    - path: /root/.token.json
- You need to update `path: /root/.env.proxy`
    - PROJECT_ID
    - SUBSCRIPTION_NAME
    - TOPIC_NAME
- After you set up all in server/poabot.config, you can save in the user-data of your server.