import { getAuthToken } from "./storage";

export async function generateContent(content, el) {
    const { type, id } = el;
    const edges = this.findEdgesByElementId(id).filter(e => e.target === id).map(e => ({ label: e.label, el: this.findElementById(e.source) }));
    console.log("Relevant edges", edges);
    const token = getAuthToken();
    if (!token || token === 'TBC') return await this.generateContentOld(content, type);
    try {
        const response = await fetch('https://c15r--2ac72f16e02411efa75ee6cdfca9ef9f.web.val.run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 4096,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `You will be given an element which is rendered into visual canvas. Either follow the user request or improve the provided content. The element content type should be <type>${type}</type>.

Please provide your response in two parts:
1. Your thought process about how to handle this request
2. The actual result/content

Here is the user request or content to process:

<related-context>
${edges.map(e => `<relation><label>${e.label || "undefined"}</label><content>${e.el.content}</content>`).join("\n")}
<related-context>

<current-content>
${content}
</current-content>

Respond only with valid json (do not wrap in code block) following the ApiResponse schema:

<schema>
interface ApiResponse {
thoughts: string;
result: string;
}
<schema>
`
                            }
                        ]
                    }
                ]
            }),
        });
        console.log("response.ok", response.ok);
        const data = await response.text();
        console.log("AI response:", data);
        try {
            const resp = JSON.parse(data);
            return resp.result;
        } catch (e) {
            console.error("Failed to parse json response", e);
            return null;
        }
    } catch (error) {
        console.error('Error fetching AI response:', error);
        return null;
    }
}

export async function regenerateImage(el) {
    try {
        const response = await fetch("https://c15r-replicate_base.web.val.run/generate", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                prompt: el.content,
                width: el.width,
                height: el.height,
            })
        });
        const newImg = await response.json();
        el.src = newImg.imageUrl;
        
    } catch (err) {
        console.error("Failed to regenerate image", err);
    }
}

async function generateContentOld(content, type) {
    try {
        const response = await fetch('/api/ai_completion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                instructions: `You will be given an element which is rendered into a visual canvas. 
Either follow the user request or improve the provided content. 
The element content type should be <content-type>${type}</content-type>.

Response should be valid JSON conforming to response schema:

<schema>
interface Response {
thinking: string;
result: string;
}
</schema>

<user_request_or_content>
${content}
</user_request_or_content>`
            }),
        });
        const data = await response.json();
        return data.result;
    } catch (error) {
        console.error('Error fetching AI response (old fallback):', error);
        return null;
    }
}