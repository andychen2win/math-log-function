
const apiKey = "AIzaSyDQv57808mHLHTTCY-_hdiNWq0Wc8KzBR8";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`; // Fallback to check connectivity first? No, let's test the BROKEN configuration.
const url3 = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`;

async function testGemini3() {
    console.log("Testing Gemini 3.0 API...");
    try {
        const response = await fetch(url3, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Hello, explain log functions." }] }],
                generationConfig: {
                    thinkingConfig: { thinkingLevel: "high" }
                }
            }),
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error Body:", errorText);
        } else {
            const data = await response.json();
            console.log("Success!");
            // console.log(JSON.stringify(data, null, 2));
            console.log("Structure check:", data.candidates?.[0]?.content?.parts?.[0]?.text ? "Text found" : "Text missing");
            if (data.candidates?.[0]?.content?.parts) {
                console.log("Parts:", JSON.stringify(data.candidates[0].content.parts, null, 2));
            }
        }
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

testGemini3();
