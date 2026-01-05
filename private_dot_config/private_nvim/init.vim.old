set nocompatible

" vim hardcodes background color erase even if the terminfo file does
" not contain bce. This causes incorrect background rendering when
" using a color theme with a background color in terminals such as
" kitty that do not support background color erase.
let &t_ut=''

highlight Normal guibg=NONE guifg=NONE ctermbg=NONE ctermfg=NONE

set number
filetype plugin on
syntax on

call plug#begin()
Plug 'nvim-lualine/lualine.nvim'
Plug 'nvim-tree/nvim-web-devicons'
Plug 'fgheng/winbar.nvim'
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
Plug 'neovim/nvim-lspconfig'
Plug 'SmiteshP/nvim-navic'
Plug 'ryanoasis/vim-devicons'
Plug 'airblade/vim-gitgutter'
Plug 'Yggdroot/indentLine'
Plug 'preservim/nerdtree' |
            \ Plug 'Xuyuanp/nerdtree-git-plugin'
Plug 'folke/tokyonight.nvim'
call plug#end()

nnoremap <leader>n :NERDTreeFocus<CR>
nnoremap <C-n> :NERDTree<CR>
nnoremap <C-t> :NERDTreeToggle<CR>
nnoremap <C-f> :NERDTreeFind<CR>
set tabstop=4
set shiftwidth=4
set expandtab
set ruler
set ignorecase
set number
set relativenumber
set guicursor=

set termguicolors
colorscheme tokyonight-night

" IndentLine
let g:indentLine_showFirstIndentLevel = 1
let g:indentLine_setColors = 0

lua require('init')
