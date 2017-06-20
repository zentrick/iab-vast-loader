import archy from 'archy'

// This prints the VAST tree, used to generate the comment section of test/unit/load-vast.js
const vastTree = archy({
  label: 'a: VAST',
  nodes: [
    { label: 'p: InLine' },
    {
      label: 'q: Wrapper',
      nodes: [
        {
          label: 'b: VAST',
          nodes: [
            {
              label: 'u: Wrapper',
              nodes: [
                {
                  label: 'd: VAST',
                  nodes: [
                    { label: 'y: InLine' }
                  ]
                }
              ]
            },
            { label: 'v: InLine' },
            {
              label: 'w: Wrapper',
              nodes: [
                {
                  label: 'e: VAST',
                  nodes: [
                    { label: 'z: InLine' }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    { label: 'r: InLine ' },
    {
      label: 's: Wrapper',
      nodes: [
        {
          label: 'c: VAST',
          nodes: [
            { label: 'x: InLine' }
          ]
        }
      ]
    },
    { label: 't: InLine' }
  ]
})

console.log(vastTree)
