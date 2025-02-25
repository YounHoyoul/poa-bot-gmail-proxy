#!/bin/bash

# Log file path
LOG_FILE="/var/log/binance_time_sync.log"

# Fetch Binance server time
get_binance_time() {
    response=$(curl -s -H "Accept: application/json" "https://api.binance.com/api/v3/time")
    echo "$response" | jq -r '.serverTime'
}

# Fetch current system time (in milliseconds)
get_local_time() {
    date +%s%3N
}

# Time synchronization function
sync_time() {
    echo "$(date): Starting time synchronization" >> "$LOG_FILE"
    
    binance_time=$(get_binance_time)
    if [ -z "$binance_time" ]; then
        echo "$(date): Error: Failed to retrieve Binance server time." >> "$LOG_FILE"
        exit 1
    fi

    local_time=$(get_local_time)
    offset=$((binance_time - local_time))

    echo "$(date): Binance server time: $(date -d @${binance_time:0:10})" >> "$LOG_FILE"
    echo "$(date): Local time: $(date -d @${local_time:0:10})" >> "$LOG_FILE"
    echo "$(date): Time difference: ${offset}ms" >> "$LOG_FILE"

    # Adjust system time if the difference is 1000ms or more
    if [ ${offset#-} -gt 1000 ]; then
        echo "$(date): Time difference is 1 second or more. Attempting synchronization" >> "$LOG_FILE"
        sudo date -s "$(date -d @${binance_time:0:10})" >> "$LOG_FILE" 2>&1
        if [ $? -eq 0 ]; then
            echo "$(date): System time has been synchronized." >> "$LOG_FILE"
        else
            echo "$(date): Error: Time synchronization failed (check sudo privileges)" >> "$LOG_FILE"
            exit 1
        fi
    else
        echo "$(date): Time difference is less than 1 second, synchronization not needed" >> "$LOG_FILE"
    fi
}

# Dependency check
check_dependencies() {
    if ! command -v curl &> /dev/null; then
        echo "$(date): Error: curl is required." >> "$LOG_FILE"
        exit 1
    fi
    if ! command -v jq &> /dev/null; then
        echo "$(date): Error: jq is required." >> "$LOG_FILE"
        exit 1
    fi
}

# Main execution
main() {
    check_dependencies
    sync_time
}

main