import os
import requests
import json
from dotenv import load_dotenv

load_dotenv("backend/.env")

def main():
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        print("MISTRAL_API_KEY not found")
        return
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    orch_id = "ag_019ca40f4f5b778897dce8a5d6e59b4f"
    
    # Try /v1/agents/completions with tool_choice=any or similar?
    # No, let's just try to be more forceful.
    payload = {
        "agent_id": orch_id,
        "messages": [{"role": "user", "content": "You MUST use your handoff tool to transfer control to the EDA agent ag_019ca40f4d5177d99a0804b04a4b268d. This is a technical requirement. Do not just talk, execute the tool call."}]
    }
    r = requests.post("https://api.mistral.ai/v1/agents/completions", headers=headers, json=payload)
    print(f"Agents Completions Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        message = data.get('choices', [{}])[0].get('message', {})
        print(f"Role: {message.get('role')}")
        print(f"Content: {message.get('content')}")
        print(f"Tool Calls: {message.get('tool_calls')}")

if __name__ == "__main__":
    main()
