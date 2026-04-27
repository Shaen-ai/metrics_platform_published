This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## AI Chat Feature

The Custom Designer includes an AI chat assistant that helps users create furniture designs through natural language.

### Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your API key:
   - **OpenAI API** (recommended): Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - **Cursor API**: If you have access to Cursor's API, use that instead

3. Configure in `.env.local`:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   AI_API_URL=https://api.openai.com/v1/chat/completions
   AI_MODEL=gpt-4o-mini
   # Laravel handles AI Room Planner intent parsing via POST /api/planner/generate
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api
   ```

4. **Important**: Restart your Next.js dev server after adding environment variables:
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

5. Test the API configuration by visiting:
   ```
   http://localhost:3000/api/ai-chat/test
   ```
   This will show if your API key is being read correctly.

### Usage

- Click the chat button (bottom-right) in the Custom Designer
- Ask the AI to create furniture, for example:
  - "Create a blue table 120cm wide and 60cm tall"
  - "Add a circular coffee table with 80cm diameter"
  - "Make a red rectangle 100cm by 50cm"

The AI will create objects on the canvas based on your requests.

## 3D Room Planner

An IKEA-style 3D room planner built with React Three Fiber.

### Architecture

```
src/app/planner/
├── page.tsx                    # Main page (client-side, dynamic canvas import)
├── planner.css                 # All planner-specific styles
├── types.ts                    # TypeScript types (Room, CatalogItem, PlacedItem, UIState)
├── data/
│   └── mockCatalog.ts          # 20 procedural furniture items with dimensions
├── store/
│   └── usePlannerStore.ts      # Zustand store with localStorage persistence
├── utils/
│   └── math.ts                 # clamp, snapToGrid, clampToRoom, degToRad, formatPrice
├── components/
│   ├── Sidebar.tsx             # Left panel: room sliders, search, furniture catalog
│   ├── TopBar.tsx              # Summary bar: item count, price, controls, keyboard hints
│   └── CanvasScene.tsx         # R3F Canvas + SceneContent + CameraController + DragPlane
└── scene/
    ├── RoomMesh.tsx            # Floor + 4 transparent walls
    ├── FurnitureMesh.tsx       # Box mesh per item, with selection outline (Edges)
    ├── FloorGrid.tsx           # Toggle-able grid lines on the floor
    └── FloorPlane.tsx          # Invisible raycast target for drag operations
```

### Features

- **Adjustable room**: Width, depth, height sliders (2-15m)
- **20-item catalog**: Searchable by name, category, vendor
- **Add furniture**: Click "+" to place at room center
- **Select & move**: Click to select, drag to move on floor plane
- **Rotate**: Q/E keys or toolbar buttons (15° steps)
- **Delete**: Delete/Backspace key or toolbar button
- **Grid & snap**: Toggle-able floor grid with 0.1m snap
- **Top view**: Orthographic-like top-down camera
- **Bounds clamping**: Furniture stays inside the room
- **Persistence**: Auto-saves to localStorage; "Reset" clears everything
- **AI Room Planner**: Submit text plus optional room/inspiration images to Laravel `POST /api/planner/generate`. AI only parses intent; Laravel rules generate the furniture plan, modules, and estimated price.
- **Keyboard shortcuts**: Q/E (rotate), Del (delete), T (top view), G (grid), S (snap), Esc (deselect)

### Running

```bash
npm install
npm run dev
# Open http://localhost:3000/planner
```

No backend or external assets required. All furniture rendered as colored boxes with correct real-world dimensions.

---

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

**Important**: When deploying, make sure to add your `OPENAI_API_KEY` (or `CURSOR_API_KEY`) as an environment variable in your Vercel project settings.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
