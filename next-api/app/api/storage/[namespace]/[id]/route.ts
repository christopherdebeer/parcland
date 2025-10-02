import { NextRequest, NextResponse } from "next/server";
import { getDbClient, initializeDatabase } from "@/lib/db";

// Initialize database on first request
let isInitialized = false;

async function ensureInitialized() {
  if (!isInitialized) {
    await initializeDatabase();
    isInitialized = true;
  }
}

// GET - Load canvas data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string; id: string }> }
) {
  try {
    await ensureInitialized();
    const { namespace, id } = await params;
    const db = getDbClient();

    const result = await db.execute({
      sql: "SELECT data, updated_at FROM canvas_data WHERE namespace = ? AND id = ?",
      args: [namespace, id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Canvas not found" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const data = JSON.parse(row.data as string);

    return NextResponse.json({
      ...data,
      _metadata: {
        updated_at: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Error loading canvas:", error);
    return NextResponse.json(
      { error: "Failed to load canvas" },
      { status: 500 }
    );
  }
}

// PUT - Save canvas data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string; id: string }> }
) {
  try {
    await ensureInitialized();
    const { namespace, id } = await params;
    const db = getDbClient();

    // Verify authorization token
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized - missing token" },
        { status: 401 }
      );
    }

    // Get request body
    const bodyText = await request.text();

    if (!bodyText) {
      return NextResponse.json(
        { error: "Missing request body" },
        { status: 400 }
      );
    }

    // Validate JSON
    try {
      JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Save to database
    await db.execute({
      sql: `
        INSERT INTO canvas_data (namespace, id, data, updated_at)
        VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(namespace, id)
        DO UPDATE SET
          data = excluded.data,
          updated_at = unixepoch()
      `,
      args: [namespace, id, bodyText],
    });

    return NextResponse.json({
      success: true,
      namespace,
      id,
      updated_at: Date.now(),
    });
  } catch (error) {
    console.error("Error saving canvas:", error);
    return NextResponse.json(
      { error: "Failed to save canvas" },
      { status: 500 }
    );
  }
}

// OPTIONS - CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
